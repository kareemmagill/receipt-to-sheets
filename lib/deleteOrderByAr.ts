import { readTab, deleteDataRows } from "./googleSheets";

// Sales Orders columns: Name(0) ... AR NO.(4) -- see lib/duplicateCheck.ts
// for the full layout.
const AR_COL = 4;

// Precise deletion by AR number -- unlike app/api/dev/delete-last/route.ts
// (which deletes whatever's positionally last, a dev-only heuristic for
// clearing test data), this targets exactly the rows belonging to one real
// order. Only safe to rely on for orders this app itself saved (AR number
// always assigned via lib/arNumber.ts), not the legacy rows that predate
// the app, where AR NO. is blank.
export async function deleteOrderByArNumber(arNumber: string): Promise<{ deleted: number }> {
  const rows = await readTab("Sales Orders");
  const dataRows = rows.slice(1);

  const matchingIndices = dataRows
    .map((row, i) => ({ i, ar: (row[AR_COL] ?? "").trim() }))
    .filter((x) => x.ar === arNumber)
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
    throw new Error(`Rows for AR ${arNumber} aren't contiguous in the sheet -- refusing to auto-delete`);
  }

  // Data rows start at sheet row 2 (row 1 is the header).
  await deleteDataRows("Sales Orders", minIndex + 2, maxIndex + 2);
  return { deleted: matchingIndices.length };
}
