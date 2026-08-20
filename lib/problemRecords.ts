import { findExistingOrderBySlip, type ExistingOrderSummary } from "./duplicateCheck";

// Sales Orders columns -- see lib/duplicateCheck.ts for the full layout.
const CLASS_COL = 1;
const SLIP_NUM_COL = 3;
const PROBLEM_COL = 20;

/**
 * One summary per distinct (slip type, slip number) pair that has at least
 * one row flagged via the item-level "Problem" button on the verification
 * form (Kareem, 2026-08-20: "flag this record for extra scrutiny"). Backs
 * the Review Problem Records page -- opening one there hands the whole
 * slip off to the normal edit flow, same as any other saved order.
 *
 * Order preserved as first-seen scanning the sheet top to bottom (oldest
 * first, same as the sheet itself).
 */
export function findProblemSlips(rows: string[][]): ExistingOrderSummary[] {
  const seen = new Set<string>();
  const summaries: ExistingOrderSummary[] = [];
  for (const row of rows.slice(1)) {
    const isProblem = (row[PROBLEM_COL] ?? "").trim().toUpperCase() === "TRUE";
    if (!isProblem) continue;

    const slipNumber = (row[SLIP_NUM_COL] ?? "").trim();
    if (!slipNumber) continue;
    const slipType = (row[CLASS_COL] ?? "").trim();

    const key = `${slipType}||${slipNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const summary = findExistingOrderBySlip(slipType, slipNumber, rows);
    if (summary) summaries.push(summary);
  }
  return summaries;
}
