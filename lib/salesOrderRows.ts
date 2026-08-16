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

// Slips get read as whatever punctuation/year-length the model saw on the
// paper -- "8/15/26", "08-15-2026", "8.15.26" -- which reads fine by eye
// but is inconsistent across rows. Standardizes to the club's documented
// month-first convention (see /api/query's system prompt), no leading
// zeros, always a 4-digit year: "8/15/2026". Only touches strings matching
// a confident numeric D-separator-D-separator-Y pattern -- anything else
// (a month name, something genuinely unreadable) passes through unchanged
// rather than risk silently writing a wrong date into the permanent
// record.
function normalizeDate(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (!match) return trimmed;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const year = match[3].length === 2 ? 2000 + parseInt(match[3], 10) : parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return trimmed;

  return `${month}/${day}/${year}`;
}

export function buildSalesOrderRows(order: EditableOrder, arNumber: string): (string | number)[][] {
  const customerName = order.customer_suggested || order.customer_written;

  return order.items.map((item) => [
    customerName,
    item.class,
    asLiteralText(normalizeDate(order.order_slip_date)),
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
