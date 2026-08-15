import { readTab } from "./googleSheets";

export interface CustomerMonthlyTotal {
  customer: string;
  monthKey: string;
  total: number;
}

export interface ItemMonthlyTotal {
  item: string;
  monthKey: string; // YYYY-MM -- still used for the month filter dropdown
  dateKey: string; // YYYY-MM-DD (or "Unknown") -- one row per exact day, not aggregated across the month
  qty: number;
  total: number;
}

// Sales Orders columns: Name(0), Class(1), Order Slip Date(2), Order Slip
// Number(3), AR NO.(4), Terms(5), Memo(6), Class(7), QTY(8), Invoice
// Class(9), Item(10), Description(11), Rate(12), Amount(13)
const NAME_COL = 0;
const DATE_COL = 2;
const QTY_COL = 8;
const DESCRIPTION_COL = 11;
const AMOUNT_COL = 13;

function parseAmount(raw: string): number {
  const n = parseFloat((raw ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseOrderDate(raw: string): { year: number; month: number; day: number } | null {
  const match = raw.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return null;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);
  if (match[3].length === 2) year += year < 70 ? 2000 : 1900;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function monthKeyFrom(raw: string): string {
  const parsed = parseOrderDate(raw ?? "");
  if (!parsed) return "Unknown";
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
}

function dateKeyFrom(raw: string): string {
  const parsed = parseOrderDate(raw ?? "");
  if (!parsed) return "Unknown";
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

export async function computeSalesReports(): Promise<{
  customerMonthly: CustomerMonthlyTotal[];
  itemMonthly: ItemMonthlyTotal[];
}> {
  const rows = await readTab("Sales Orders");
  const dataRows = rows.slice(1); // skip header

  const customerMap = new Map<string, number>();
  // Item sales are tracked per exact day, not aggregated across the whole
  // month -- the Menu Item report shows individual dates.
  const itemMap = new Map<string, { qty: number; total: number }>();

  for (const row of dataRows) {
    const name = (row[NAME_COL] ?? "").trim();
    const description = (row[DESCRIPTION_COL] ?? "").trim();
    const amount = parseAmount(row[AMOUNT_COL] ?? "");
    const qty = parseAmount(row[QTY_COL] ?? "");
    if (!name && !description) continue;

    const rawDate = row[DATE_COL] ?? "";
    const monthKey = monthKeyFrom(rawDate);
    const dateKey = dateKeyFrom(rawDate);

    if (name) {
      const key = `${monthKey}||${name}`;
      customerMap.set(key, (customerMap.get(key) ?? 0) + amount);
    }
    if (description) {
      const key = `${dateKey}||${description}`;
      const existing = itemMap.get(key) ?? { qty: 0, total: 0 };
      itemMap.set(key, { qty: existing.qty + qty, total: existing.total + amount });
    }
  }

  const customerMonthly = [...customerMap.entries()]
    .map(([key, total]) => {
      const [monthKey, customer] = key.split("||");
      return { customer, monthKey, total };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || b.total - a.total);

  const itemMonthly = [...itemMap.entries()]
    .map(([key, v]) => {
      const [dateKey, item] = key.split("||");
      const monthKey = dateKey === "Unknown" ? "Unknown" : dateKey.slice(0, 7);
      return { item, monthKey, dateKey, qty: v.qty, total: v.total };
    })
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.total - a.total);

  return { customerMonthly, itemMonthly };
}
