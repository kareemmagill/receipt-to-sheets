import { readTab } from "./googleSheets";
import { parseCalendarDate } from "./dateNormalize";

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

// Unaggregated -- one entry per real sheet row, so a customer's total (from
// customerMonthly) can be broken back down into the actual line items that
// add up to it, e.g. on the reports page when a customer search matches.
export interface CustomerOrderLine {
  customer: string;
  monthKey: string;
  dateKey: string;
  item: string;
  qty: number;
  amount: number;
}

// Sales Orders columns: Name(0), Class(1), Order Slip Date(2), Order Slip
// Number(3), AR NO.(4), Terms(5), Memo(6), Class(7), QTY(8), Invoice
// Class(9), Item(10), Description(11), Rate(12), Amount(13)
const NAME_COL = 0;
const DATE_COL = 2;
const QTY_COL = 8;
const ITEM_COL = 10;
const DESCRIPTION_COL = 11;
const AMOUNT_COL = 13;

function parseAmount(raw: string): number {
  const n = parseFloat((raw ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function monthKeyFrom(raw: string): string {
  const parsed = parseCalendarDate(raw ?? "");
  if (!parsed) return "Unknown";
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
}

function dateKeyFrom(raw: string): string {
  const parsed = parseCalendarDate(raw ?? "");
  if (!parsed) return "Unknown";
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

export async function computeSalesReports(): Promise<{
  customerMonthly: CustomerMonthlyTotal[];
  itemMonthly: ItemMonthlyTotal[];
  customerOrderLines: CustomerOrderLine[];
}> {
  const rows = await readTab("Sales Orders");
  const dataRows = rows.slice(1); // skip header

  const customerMap = new Map<string, number>();
  // Item sales are tracked per exact day, not aggregated across the whole
  // month -- the Menu Item report shows individual dates. Keyed by
  // resolved item code rather than the raw handwritten description --
  // real data has the same item saved under different casing across scans
  // (e.g. "COKE ZERO" vs "Coke Zero", both item code BECOZ8), which used
  // to silently split into two separate report rows and undercount each
  // variant (found 2026-08-17). Falls back to a lowercased description for
  // items that never matched a code, so at least casing variants of those
  // still merge too. label holds whichever description was seen first,
  // for display.
  const itemMap = new Map<string, { label: string; qty: number; total: number }>();
  const customerOrderLines: CustomerOrderLine[] = [];

  for (const row of dataRows) {
    const name = (row[NAME_COL] ?? "").trim();
    const description = (row[DESCRIPTION_COL] ?? "").trim();
    const itemCode = (row[ITEM_COL] ?? "").trim();
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
      const itemKey = itemCode || description.toLowerCase();
      const key = `${dateKey}||${itemKey}`;
      const existing = itemMap.get(key) ?? { label: description, qty: 0, total: 0 };
      itemMap.set(key, { label: existing.label, qty: existing.qty + qty, total: existing.total + amount });
    }
    if (name && description) {
      customerOrderLines.push({ customer: name, monthKey, dateKey, item: description, qty, amount });
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
      const [dateKey] = key.split("||");
      const monthKey = dateKey === "Unknown" ? "Unknown" : dateKey.slice(0, 7);
      return { item: v.label, monthKey, dateKey, qty: v.qty, total: v.total };
    })
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.total - a.total);

  customerOrderLines.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  return { customerMonthly, itemMonthly, customerOrderLines };
}
