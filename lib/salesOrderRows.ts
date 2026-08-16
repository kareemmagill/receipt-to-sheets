import type { EditableOrder } from "@/components/VerificationForm";

// Matches the real Sales Orders header row exactly: Name, Class, Order Slip
// Date, Order Slip Number, AR NO. , Terms, Memo, Class, QTY, Invoice Class,
// Item, Description, Rate, Amount, Waitress, Member Status (Waitress and
// Member Status both added 2026-08-15, appended as the 15th/16th columns
// rather than inserted among the existing ones, so nothing that reads this
// sheet by position gets shifted) — with the Class column appearing twice
// (B and H). Class is per-item (Restaurant or Bar, depending on the item),
// not per-order, so rows for the same order can carry different Class
// values. Memo holds only the slip's own memo/note text now -- Waitress
// used to be folded into it (no column of its own existed yet) but that's
// no longer needed.
// A leading apostrophe tells Sheets' USER_ENTERED parser to store the value
// as literal text instead of auto-parsing it — without this, a date-looking
// string like "8/27/25" gets converted into a date serial number, which
// then displays as a raw number (e.g. "46248") whenever the cell doesn't
// happen to inherit a date number format. The apostrophe itself never shows
// up in the stored/displayed value.
function asLiteralText(value: string): string {
  return `'${value}`;
}

// Order Slip Date column -- see the header comment above.
const DATE_COL = 2;

interface DateCandidate {
  day: number;
  month: number;
  year: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Reads the two numbers before the year as day-then-month (Kareem's
// preference, 2026-08-16 -- matches how PGYC staff actually write dates,
// day first) or month-then-day, keeping only readings where both land in a
// real calendar range. Most real dates only parse one way (whichever
// number is 13-31 can only be the day), which is why this returns more
// than one candidate only for genuinely ambiguous slips like "5/8/26".
function parseDateCandidates(n1: number, n2: number, yearRaw: string): DateCandidate[] {
  const year = yearRaw.length === 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10);
  const candidates: DateCandidate[] = [];
  if (n1 >= 1 && n1 <= 31 && n2 >= 1 && n2 <= 12) candidates.push({ day: n1, month: n2, year });
  if (n2 >= 1 && n2 <= 31 && n1 >= 1 && n1 <= 12 && n1 !== n2) candidates.push({ day: n2, month: n1, year });
  return candidates;
}

function daysApart(c: DateCandidate, reference: Date): number {
  const asDate = new Date(c.year, c.month - 1, c.day);
  return Math.abs(asDate.getTime() - reference.getTime()) / 86_400_000;
}

/**
 * Finds the most recently saved order's date, for resolving ambiguous new
 * dates against it (see normalizeDate below) -- "the dates must be the
 * same or close," per Kareem. Tries day-first first (what this app always
 * writes going forward), falling back to month-first for older legacy rows
 * that predate this. Returns null if nothing in the sheet parses (e.g. a
 * freshly wiped sheet), in which case normalizeDate just defaults to
 * day-first with no reference to check against.
 */
export function mostRecentOrderDate(salesOrderRows: string[][]): Date | null {
  for (let i = salesOrderRows.length - 1; i >= 1; i--) {
    const raw = (salesOrderRows[i][DATE_COL] ?? "").trim();
    const match = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
    if (!match) continue;

    const candidates = parseDateCandidates(parseInt(match[1], 10), parseInt(match[2], 10), match[3]);
    if (candidates.length > 0) return new Date(candidates[0].year, candidates[0].month - 1, candidates[0].day);
  }
  return null;
}

// Slips get read as whatever punctuation/year-length the model saw on the
// paper -- "8/15/26", "08-15-2026", "8.15.26" -- which reads fine by eye
// but is inconsistent across rows. Standardizes to dd/mm/yyyy, day-first
// (Kareem's preference, 2026-08-16). When both readings are numerically
// valid (a genuinely ambiguous slip, e.g. "5/8/26"), whichever is closer
// to referenceDate (the most recently saved order) wins, since consecutive
// scans are almost always from the same shift; day-first is the default
// when there's no reference to check against. Only touches strings
// matching a confident numeric D-separator-D-separator-Y pattern --
// anything else (a month name, something genuinely unreadable) passes
// through unchanged rather than risk silently writing a wrong date into
// the permanent record.
export function normalizeDate(value: string, referenceDate: Date | null): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (!match) return trimmed;

  const candidates = parseDateCandidates(parseInt(match[1], 10), parseInt(match[2], 10), match[3]);
  if (candidates.length === 0) return trimmed;

  const chosen =
    candidates.length > 1 && referenceDate
      ? candidates.reduce((closest, c) => (daysApart(c, referenceDate) < daysApart(closest, referenceDate) ? c : closest))
      : candidates[0]; // day-first reading, since it's built first above

  return `${pad2(chosen.day)}/${pad2(chosen.month)}/${chosen.year}`;
}

export function buildSalesOrderRows(
  order: EditableOrder,
  arNumber: string,
  referenceDate: Date | null
): (string | number)[][] {
  const customerName = order.customer_suggested || order.customer_written;

  return order.items.map((item) => [
    customerName,
    item.class,
    asLiteralText(normalizeDate(order.order_slip_date, referenceDate)),
    asLiteralText(order.order_slip_number),
    arNumber,
    order.terms,
    order.memo,
    item.class,
    item.qty,
    item.invoice_class,
    item.item,
    item.description,
    item.rate,
    item.amount,
    order.waitress,
    order.member_status,
  ]);
}
