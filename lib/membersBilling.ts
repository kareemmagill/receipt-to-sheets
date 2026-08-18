import { readTab } from "./googleSheets";
import { parseAmount, dateKeyFromRow } from "./salesRowHelpers";

// Sales Orders columns -- see lib/salesOrderRows.ts's header comment for
// the full layout.
const NAME_COL = 0;
const SLIP_NUM_COL = 3;
const TERMS_COL = 5;
const AMOUNT_COL = 13;
const MEMBER_STATUS_COL = 15;

export interface MemberSpendEntry {
  name: string;
  totalSpend: number;
}

/**
 * Every registered Member (from the Customers tab -- the club's roster,
 * not just whoever has ordered before), ranked by total lifetime spend as
 * a Member -- powers the Members Billing search box's suggestion order
 * (Kareem, 2026-08-20: "order suggestions by biggest spender first").
 * Members with no orders yet still appear, at 0.
 */
export async function membersBySpend(): Promise<MemberSpendEntry[]> {
  const [customerRows, salesOrderRows] = await Promise.all([readTab("Customers"), readTab("Sales Orders")]);

  const spendByName = new Map<string, number>();
  for (const row of customerRows) {
    const name = (row[0] ?? "").trim();
    if (name) spendByName.set(name, 0);
  }

  for (const row of salesOrderRows.slice(1)) {
    if ((row[MEMBER_STATUS_COL] ?? "").trim() !== "Member") continue;
    const name = (row[NAME_COL] ?? "").trim();
    if (!name) continue;
    const amount = parseAmount(row[AMOUNT_COL] ?? "");
    spendByName.set(name, (spendByName.get(name) ?? 0) + amount);
  }

  return [...spendByName.entries()]
    .map(([name, totalSpend]) => ({ name, totalSpend }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

export interface MemberSlip {
  slipNumber: string;
  date: string; // yyyy-mm-dd
  amount: number;
  paid: boolean; // terms === "COD"
}

interface SlipAggregate {
  slipNumber: string;
  date: string;
  amount: number;
  terms: string;
}

/**
 * Every slip on record for one member, most recent first -- one entry per
 * physical slip (line items summed), same grouping as
 * lib/dailyReport.ts/lib/monthlyReport.ts (Kareem, 2026-08-20: "list all
 * slips, dates, ammount"). Matches by the exact name string on the row,
 * not member status, so a row mismarked Non-Member for this person still
 * shows up.
 */
export async function slipsForMember(name: string): Promise<MemberSlip[]> {
  const rows = await readTab("Sales Orders");
  const bySlip = new Map<string, SlipAggregate>();

  for (const row of rows.slice(1)) {
    if ((row[NAME_COL] ?? "").trim() !== name) continue;

    const slipNumber = (row[SLIP_NUM_COL] ?? "").trim();
    if (!slipNumber) continue;

    const amount = parseAmount(row[AMOUNT_COL] ?? "");
    const existing = bySlip.get(slipNumber);
    if (existing) {
      existing.amount += amount;
    } else {
      bySlip.set(slipNumber, {
        slipNumber,
        date: dateKeyFromRow(row) ?? "",
        amount,
        terms: (row[TERMS_COL] ?? "").trim(),
      });
    }
  }

  return [...bySlip.values()]
    .sort((a, b) => b.date.localeCompare(a.date) || b.slipNumber.localeCompare(a.slipNumber))
    .map((s) => ({ slipNumber: s.slipNumber, date: s.date, amount: s.amount, paid: s.terms === "COD" }));
}

export interface MemberBillingDetail {
  name: string;
  totalSales: number;
  totalDues: number;
  slips: MemberSlip[];
}

/**
 * One member's full billing picture -- every slip, total lifetime sales,
 * and total outstanding (unpaid/CREDIT) dues. Backs both the Members
 * Billing search on the Scan a Slip page and the "view all sales" link on
 * a customer's name in the Monthly Sales view (Kareem, 2026-08-20:
 * "display total sales total dues" / "add a link on the members name to
 * show all there sales").
 */
export async function memberBillingDetail(name: string): Promise<MemberBillingDetail> {
  const slips = await slipsForMember(name);
  const totalSales = slips.reduce((sum, s) => sum + s.amount, 0);
  const totalDues = slips.reduce((sum, s) => sum + (s.paid ? 0 : s.amount), 0);
  return { name, totalSales, totalDues, slips };
}
