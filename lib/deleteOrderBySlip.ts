import { readTab, deleteDataRows } from "./googleSheets";

// Sales Orders columns: Name(0) ... Order Slip Number(3) -- see
// lib/duplicateCheck.ts for the full layout.
const SLIP_NUM_COL = 3;

// Precise deletion by order slip number -- unlike
// app/api/dev/delete-last/route.ts (which deletes whatever's positionally
// last, a dev-only heuristic for clearing test data), this targets exactly
// the rows belonging to one real order. Slip number is what's physically
// printed on the chit and always unique (Kareem, 2026-08-16) -- this
// replaced AR number as the app's identity key for update/delete/photo
// lookups, since AR number is blank on legacy rows that predate this app's
// own numbering, while slip number works for those too.
export async function deleteOrderBySlipNumber(slipNumber: string): Promise<{ deleted: number }> {
  const rows = await readTab("Sales Orders");
  const dataRows = rows.slice(1);

  const matchingIndices = dataRows
    .map((row, i) => ({ i, slip: (row[SLIP_NUM_COL] ?? "").trim() }))
    .filter((x) => x.slip === slipNumber)
    .map((x) => x.i);

  if (matchingIndices.length === 0) {
    return { deleted: 0 };
  }

  const minIndex = Math.min(...matchingIndices);
  const maxIndex = Math.max(...matchingIndices);
  // An order's rows are always appended together (lib/salesOrderRows.ts),
  // so they should be contiguous. If they're not, something unexpected has
  // happened to the sheet since this order was saved -- refuse rather than
  // deleting a wider range than intended.
  if (maxIndex - minIndex + 1 !== matchingIndices.length) {
    throw new Error(`Rows for slip #${slipNumber} aren't contiguous in the sheet -- refusing to auto-delete`);
  }

  // Data rows start at sheet row 2 (row 1 is the header).
  await deleteDataRows("Sales Orders", minIndex + 2, maxIndex + 2);
  return { deleted: matchingIndices.length };
}
