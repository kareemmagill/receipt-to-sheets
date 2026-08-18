import { readTab } from "./googleSheets";
import { photoLinksBySlipNumber, type PhotoLinkInfo } from "./photoLog";
import { parseAmount, dateKeyFromRow } from "./salesRowHelpers";

// Sales Orders columns -- see lib/salesOrderRows.ts's header comment for
// the full layout.
const NAME_COL = 0;
const SLIP_NUM_COL = 3;
const TERMS_COL = 5;
const AMOUNT_COL = 13;
const MEMBER_STATUS_COL = 15;

// A fixed 24h shift applied to the UTC instant before formatting into
// Asia/Manila is safe regardless of the +8 offset -- the Philippines
// doesn't observe DST, so there's no ambiguous/skipped local time to land
// on. Needed because Vercel's server clock is UTC, not the club's local
// time (Kareem, 2026-08-17): a naive server "today" would still read as
// yesterday for the first ~8 hours of the Philippines' calendar day.
function phtDateKey(offsetDays = 0): string {
  const instant = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${year}-${month}-${day}`;
}

/**
 * Yesterday if it has any records, else today if it does, else the most
 * recent date that has records at all, else just today (nothing ever
 * recorded) -- per Kareem, 2026-08-17. All relative to Philippines local
 * time, not the server's.
 */
function resolveDefaultDateKey(rows: string[][]): string {
  const dateKeys = new Set<string>();
  for (const row of rows.slice(1)) {
    const key = dateKeyFromRow(row);
    if (key) dateKeys.add(key);
  }

  const yesterday = phtDateKey(-1);
  if (dateKeys.has(yesterday)) return yesterday;

  const today = phtDateKey(0);
  if (dateKeys.has(today)) return today;

  if (dateKeys.size > 0) return [...dateKeys].sort().at(-1)!;

  return today;
}

interface SlipAggregate {
  slipNumber: string;
  customer: string;
  memberStatus: string;
  terms: string;
  total: number;
}

// One entry per physical slip (not per line item) -- sums every row that
// shares a slip number, for the requested day only.
function aggregateSlipsForDate(rows: string[][], dateKey: string): SlipAggregate[] {
  const bySlip = new Map<string, SlipAggregate>();

  for (const row of rows.slice(1)) {
    if (dateKeyFromRow(row) !== dateKey) continue;

    const slipNumber = (row[SLIP_NUM_COL] ?? "").trim();
    if (!slipNumber) continue; // nothing to group repeat line items under

    const amount = parseAmount(row[AMOUNT_COL] ?? "");
    const existing = bySlip.get(slipNumber);
    if (existing) {
      existing.total += amount;
    } else {
      bySlip.set(slipNumber, {
        slipNumber,
        customer: (row[NAME_COL] ?? "").trim(),
        memberStatus: (row[MEMBER_STATUS_COL] ?? "").trim(),
        terms: (row[TERMS_COL] ?? "").trim(),
        total: amount,
      });
    }
  }

  return [...bySlip.values()];
}

export interface DailyReportCustomerLine {
  customer: string;
  // More than one only when the same customer has multiple slips in this
  // category on this day -- otherwise just the one.
  slipNumbers: string[];
  total: number;
}

export interface DailyReportBucket {
  total: number;
  lines: DailyReportCustomerLine[];
}

function bucketize(slips: SlipAggregate[]): DailyReportBucket {
  const byCustomer = new Map<string, DailyReportCustomerLine>();
  for (const s of slips) {
    const existing = byCustomer.get(s.customer);
    if (existing) {
      existing.slipNumbers.push(s.slipNumber);
      existing.total += s.total;
    } else {
      byCustomer.set(s.customer, { customer: s.customer, slipNumbers: [s.slipNumber], total: s.total });
    }
  }
  const lines = [...byCustomer.values()].sort((a, b) => a.customer.localeCompare(b.customer));
  return { lines, total: lines.reduce((sum, l) => sum + l.total, 0) };
}

export interface DailyReport {
  dateKey: string;
  membersPaid: DailyReportBucket;
  nonMembersPaid: DailyReportBucket;
  membersNotPaid: DailyReportBucket;
  // Should stay empty going forward -- the verification form no longer
  // lets a Non-Member be marked Not Paid (Kareem, 2026-08-17). Kept and
  // surfaced (only rendered by the UI when non-empty) rather than silently
  // folded into another bucket, so a pre-existing/edge-case row like this
  // is never invisible in a financial report and Total Sales below is
  // never silently short.
  nonMembersNotPaid: DailyReportBucket;
  totalSales: number;
  // Only the slip numbers that actually appear above -- keyed here so the
  // report page can link a slip number straight to its archived photo
  // without a separate round trip per row (Kareem, 2026-08-17: "link the
  // slip number to the google image").
  photos: Record<string, PhotoLinkInfo>;
  // Every distinct date (across the whole sheet, not just this month) that
  // has at least one recorded sale -- lets the calendar bold those days
  // without a separate round trip per month viewed. Total sales per date
  // (not just presence/absence), keyed yyyy-mm-dd -- powers the calendar's
  // white-to-yellow heat map, scaled per month to whichever day sold the
  // most (Kareem, 2026-08-18).
  salesByDate: Record<string, number>;
}

export async function computeDailyReport(requestedDateKey?: string): Promise<DailyReport> {
  // Neither depends on the other's result -- run concurrently instead of
  // paying two sequential Sheets round trips (Kareem, 2026-08-19: "make it
  // run faster").
  const [rows, allPhotos] = await Promise.all([readTab("Sales Orders"), photoLinksBySlipNumber()]);
  const dateKey = requestedDateKey || resolveDefaultDateKey(rows);
  const slips = aggregateSlipsForDate(rows, dateKey);

  const membersPaid = bucketize(slips.filter((s) => s.memberStatus === "Member" && s.terms === "COD"));
  const membersNotPaid = bucketize(slips.filter((s) => s.memberStatus === "Member" && s.terms === "CREDIT"));
  const nonMembersPaid = bucketize(slips.filter((s) => s.memberStatus === "Non-Member" && s.terms === "COD"));
  const nonMembersNotPaid = bucketize(slips.filter((s) => s.memberStatus === "Non-Member" && s.terms === "CREDIT"));

  // Summed from every slip that day, not from the four buckets above --
  // a slip with a blank/unrecognized member status or terms (rare, but
  // possible on older rows) still counts toward the real total even
  // though it won't appear in any breakdown section.
  const totalSales = slips.reduce((sum, s) => sum + s.total, 0);

  const photos: Record<string, PhotoLinkInfo> = {};
  for (const s of slips) {
    const info = allPhotos.get(s.slipNumber);
    if (info) photos[s.slipNumber] = info;
  }

  const salesByDateMap = new Map<string, number>();
  for (const row of rows.slice(1)) {
    const key = dateKeyFromRow(row);
    if (!key) continue;
    const amount = parseAmount(row[AMOUNT_COL] ?? "");
    salesByDateMap.set(key, (salesByDateMap.get(key) ?? 0) + amount);
  }
  const salesByDate = Object.fromEntries(salesByDateMap);

  return { dateKey, membersPaid, nonMembersPaid, membersNotPaid, nonMembersNotPaid, totalSales, photos, salesByDate };
}
