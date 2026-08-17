// Order Slip Date column in Sales Orders -- see lib/salesOrderRows.ts's
// header comment for the full layout.
const DATE_COL = 2;

export interface DateCandidate {
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

// Single best-guess parse of a D-separator-D-separator-Y string, day-first
// when genuinely ambiguous (no reference date to disambiguate against here
// -- callers wanting that should use normalizeDate below instead). Used
// anywhere that just needs *a* calendar date out of a saved row, e.g.
// lib/reports.ts grouping sales by day/month -- which used to hand-roll
// its own month-first parser, silently misreading every real dd/mm/yyyy
// row this app actually writes (found 2026-08-17: everything with a day
// > 12 fell into "Unknown", everything else landed in the wrong month).
export function parseCalendarDate(raw: string): DateCandidate | null {
  const match = raw.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (!match) return null;
  const candidates = parseDateCandidates(parseInt(match[1], 10), parseInt(match[2], 10), match[3]);
  return candidates[0] ?? null;
}

function daysApart(c: DateCandidate, reference: Date): number {
  const asDate = new Date(c.year, c.month - 1, c.day);
  return Math.abs(asDate.getTime() - reference.getTime()) / 86_400_000;
}

// Slips get scanned in the same shift/week as each other, never years
// apart -- a year this far from the reference almost certainly means a
// single OCR-misread year digit (found 2026-08-17: slip #21206 read as
// "08/11/2020" while every other slip that week was 2026 -- a misread 6
// as 0), not a genuinely old or future order.
const YEAR_SANITY_WINDOW_DAYS = 60;

// If swapping in the reference date's year would land within a sane
// window, trust that year over whatever the model actually read --
// "common sense" over a raw OCR digit, per Kareem, 2026-08-17.
function withSaneYear(c: DateCandidate, referenceDate: Date | null): DateCandidate {
  if (!referenceDate || c.year === referenceDate.getFullYear()) return c;
  const resniffed = { ...c, year: referenceDate.getFullYear() };
  return daysApart(resniffed, referenceDate) <= YEAR_SANITY_WINDOW_DAYS ? resniffed : c;
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
  // A legitimate order is never years away from today -- guards against a
  // single already-corrupted row (e.g. a misread year digit, before this
  // file's own sanity check existed to catch it) becoming the reference
  // every future save gets checked against, which would defeat the point.
  const now = new Date();

  for (let i = salesOrderRows.length - 1; i >= 1; i--) {
    const raw = (salesOrderRows[i][DATE_COL] ?? "").trim();
    const match = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
    if (!match) continue;

    const candidates = parseDateCandidates(parseInt(match[1], 10), parseInt(match[2], 10), match[3]);
    const sane = candidates.find((c) => Math.abs(c.year - now.getFullYear()) <= 1);
    if (sane) return new Date(sane.year, sane.month - 1, sane.day);
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
// when there's no reference to check against (e.g. the live verification
// screen, which normalizes for display only, with no sheet data on hand to
// compare against -- the definitive resolution with a real reference date
// happens again at actual save time, in app/api/save/route.ts). Only
// touches strings matching a confident numeric D-separator-D-separator-Y
// pattern -- anything else (a month name, something genuinely unreadable)
// passes through unchanged rather than risk silently writing a wrong date
// into the permanent record.
export function normalizeDate(value: string, referenceDate: Date | null): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (!match) return trimmed;

  const candidates = parseDateCandidates(parseInt(match[1], 10), parseInt(match[2], 10), match[3]);
  if (candidates.length === 0) return trimmed;

  // Correct an implausible year on each candidate *before* picking
  // between day-first/month-first readings -- otherwise two candidates
  // that are both years away from the reference look equally "close" by
  // raw day count (both off by ~2000+ days), when only one of them
  // actually makes sense once its year gets fixed.
  const saneCandidates = candidates.map((c) => withSaneYear(c, referenceDate));

  const chosen =
    saneCandidates.length > 1 && referenceDate
      ? saneCandidates.reduce((closest, c) => (daysApart(c, referenceDate) < daysApart(closest, referenceDate) ? c : closest))
      : saneCandidates[0]; // day-first reading, since it's built first above

  return `${pad2(chosen.day)}/${pad2(chosen.month)}/${chosen.year}`;
}
