import { readTab } from "./googleSheets";
import { parseAmount, dateKeyFromRow, monthKeyFromRow } from "./salesRowHelpers";

// Sales Orders columns -- see lib/salesOrderRows.ts's header comment for
// the full layout.
const NAME_COL = 0;
const SLIP_NUM_COL = 3;
const TERMS_COL = 5;
const AMOUNT_COL = 13;
const MEMBER_STATUS_COL = 15;

// Same fixed 24h-shift trick as lib/dailyReport.ts's phtDateKey -- see that
// file's comment for why a naive server "today" is wrong here.
function phtMonthKeyNow(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  return `${year}-${month}`;
}

/**
 * The current month if it has any records, else the most recent month
 * that has records at all, else just the current month (nothing ever
 * recorded) -- mirrors lib/dailyReport.ts's resolveDefaultDateKey.
 */
function resolveDefaultMonthKey(rows: string[][]): string {
  const monthKeys = new Set<string>();
  for (const row of rows.slice(1)) {
    const key = monthKeyFromRow(row);
    if (key) monthKeys.add(key);
  }

  const current = phtMonthKeyNow();
  if (monthKeys.has(current)) return current;
  if (monthKeys.size > 0) return [...monthKeys].sort().at(-1)!;
  return current;
}

interface SlipAggregate {
  slipNumber: string;
  customer: string;
  memberStatus: string;
  terms: string;
  dateKey: string;
  total: number;
}

// One entry per physical slip (not per line item) -- sums every row that
// shares a slip number, for the requested month only.
function aggregateSlipsForMonth(rows: string[][], monthKey: string): SlipAggregate[] {
  const bySlip = new Map<string, SlipAggregate>();

  for (const row of rows.slice(1)) {
    if (monthKeyFromRow(row) !== monthKey) continue;

    const slipNumber = (row[SLIP_NUM_COL] ?? "").trim();
    if (!slipNumber) continue;

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
        dateKey: dateKeyFromRow(row) ?? "",
        total: amount,
      });
    }
  }

  return [...bySlip.values()];
}

export interface MonthlyCustomerLine {
  customer: string;
  total: number;
}

export interface MonthlyBucket {
  total: number;
  lines: MonthlyCustomerLine[];
}

function bucketize(slips: SlipAggregate[]): MonthlyBucket {
  const byCustomer = new Map<string, MonthlyCustomerLine>();
  for (const s of slips) {
    const existing = byCustomer.get(s.customer);
    if (existing) {
      existing.total += s.total;
    } else {
      byCustomer.set(s.customer, { customer: s.customer, total: s.total });
    }
  }
  const lines = [...byCustomer.values()].sort((a, b) => a.customer.localeCompare(b.customer));
  return { lines, total: lines.reduce((sum, l) => sum + l.total, 0) };
}

export interface MonthlySlipDetail {
  slipNumber: string;
  date: string; // yyyy-mm-dd
  amount: number;
  paid: boolean; // terms === "COD"
}

export interface MonthlyReport {
  monthKey: string; // yyyy-mm
  membersPaid: MonthlyBucket;
  nonMembersPaid: MonthlyBucket;
  membersNotPaid: MonthlyBucket;
  // Should stay empty going forward -- same edge case lib/dailyReport.ts
  // flags (a Non-Member marked Not Paid shouldn't happen post-2026-08-17).
  nonMembersNotPaid: MonthlyBucket;
  totalSales: number;
  // Every one of a customer's slips this month, regardless of which bucket
  // above they landed in -- powers the "click a name" breakdown (Kareem,
  // 2026-08-18: "when clicking on a name, open a list of all slips for
  // that person"). Keyed by the exact customer string used in the buckets.
  slipsByCustomer: Record<string, MonthlySlipDetail[]>;
  // Total sales per month (yyyy-mm), across the whole sheet -- powers the
  // 12-month calendar's white-to-yellow heat map, scaled per viewed year
  // the same way the daily calendar scales per viewed month.
  salesByMonth: Record<string, number>;
}

export async function computeMonthlyReport(requestedMonthKey?: string): Promise<MonthlyReport> {
  const rows = await readTab("Sales Orders");
  const monthKey = requestedMonthKey || resolveDefaultMonthKey(rows);
  const slips = aggregateSlipsForMonth(rows, monthKey);

  const membersPaid = bucketize(slips.filter((s) => s.memberStatus === "Member" && s.terms === "COD"));
  const membersNotPaid = bucketize(slips.filter((s) => s.memberStatus === "Member" && s.terms === "CREDIT"));
  const nonMembersPaid = bucketize(slips.filter((s) => s.memberStatus === "Non-Member" && s.terms === "COD"));
  const nonMembersNotPaid = bucketize(slips.filter((s) => s.memberStatus === "Non-Member" && s.terms === "CREDIT"));

  const totalSales = slips.reduce((sum, s) => sum + s.total, 0);

  const slipsByCustomer: Record<string, MonthlySlipDetail[]> = {};
  for (const s of slips) {
    const list = slipsByCustomer[s.customer] ?? (slipsByCustomer[s.customer] = []);
    list.push({ slipNumber: s.slipNumber, date: s.dateKey, amount: s.total, paid: s.terms === "COD" });
  }
  for (const list of Object.values(slipsByCustomer)) {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.slipNumber.localeCompare(b.slipNumber));
  }

  const salesByMonthMap = new Map<string, number>();
  for (const row of rows.slice(1)) {
    const key = monthKeyFromRow(row);
    if (!key) continue;
    salesByMonthMap.set(key, (salesByMonthMap.get(key) ?? 0) + parseAmount(row[AMOUNT_COL] ?? ""));
  }
  const salesByMonth = Object.fromEntries(salesByMonthMap);

  return {
    monthKey,
    membersPaid,
    nonMembersPaid,
    membersNotPaid,
    nonMembersNotPaid,
    totalSales,
    slipsByCustomer,
    salesByMonth,
  };
}
