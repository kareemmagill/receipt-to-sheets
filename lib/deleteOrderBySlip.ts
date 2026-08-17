import { readTab, deleteDataRowsAt } from "./googleSheets";

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
//
// Deletes each matching row by its own exact position rather than
// assuming they're one contiguous range -- an order's rows are appended
// together when first saved, but a later "Update Record" appends its
// fresh rows at the very end of the sheet while the original rows stay
// wherever they were, so anything saved in between (any other slip) ends
// up sitting between the old and new copies. A prior version required
// strict contiguity and refused to delete otherwise, which meant the
// stale copy was left behind indefinitely -- a real duplicate found in
// production, Kareem, 2026-08-17: slip #34908 had one row saved earlier
// and a fresh one appended after 8 other slips were saved in between,
// silently double-counting that order in every report until caught.
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

  // Data rows start at sheet row 2 (row 1 is the header).
  await deleteDataRowsAt("Sales Orders", matchingIndices.map((i) => i + 2));
  return { deleted: matchingIndices.length };
}
