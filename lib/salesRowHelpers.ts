import { parseCalendarDate } from "./dateNormalize";

// Shared by lib/dailyReport.ts and lib/monthlyReport.ts -- both aggregate
// the same Sales Orders rows, just grouped by day vs. by month (Kareem,
// 2026-08-18: added a Monthly Sales view alongside the existing daily
// one). Sales Orders columns -- see lib/salesOrderRows.ts's header comment
// for the full layout.
export const DATE_COL = 2;

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseAmount(raw: string): number {
  const n = parseFloat((raw ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function dateKeyFromRow(row: string[]): string | null {
  const parsed = parseCalendarDate(row[DATE_COL] ?? "");
  if (!parsed) return null;
  return `${parsed.year}-${pad2(parsed.month)}-${pad2(parsed.day)}`;
}

export function monthKeyFromRow(row: string[]): string | null {
  const parsed = parseCalendarDate(row[DATE_COL] ?? "");
  if (!parsed) return null;
  return `${parsed.year}-${pad2(parsed.month)}`;
}
