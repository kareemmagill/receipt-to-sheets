import type { ItemCodeEntry } from "./itemCodeScoring";

// Sales Orders columns: ... Item(10), Description(11) ... Original
// Description(19) -- see lib/salesOrderRows.ts for the full layout.
const ITEM_COL = 10;
const DESC_COL = 11;
const ORIGINAL_DESC_COL = 19;

/**
 * Past (written description -> confirmed item code) pairs from real saved
 * orders, reframed as ItemCodeEntry so they can be scored/matched
 * alongside the real Inventory tab by the exact same
 * matchItemCodeCandidates pipeline. Self-correcting the same way
 * lib/knownNames.ts's waitress/walk-in lists are: the item code only ever
 * lands in a saved row via either a confident auto-match or a manual pick
 * on the verification screen, so once a misread abbreviation gets
 * corrected once, that pairing is available to match confidently next
 * time the OCR produces the same (or similar) text -- an exact repeat of
 * the same handwriting scores 1.0 against its own past correction, well
 * above the confident-match threshold.
 *
 * Learns from both Description and Original Description -- picking a
 * candidate chip cleans up Description to the canonical name (e.g. "extra
 * rice" -> "Rice"), which is what you want on the sheet but would erase
 * the actual handwriting this needs to remember; Original Description
 * (added 2026-08-17) is frozen at extraction time and never touched
 * again, so "extra rice" -> that item code still gets learned even though
 * the visible Description no longer says that. Rows saved before that
 * column existed just contribute their Description as before.
 *
 * Last save wins when a description has been paired with more than one
 * code over time (Sales Orders rows are in sheet order, oldest first, so
 * later entries overwrite earlier ones here) -- the most recent human
 * judgment is the one worth trusting.
 *
 * Takes already-fetched Sales Orders rows rather than reading the tab
 * itself -- see lib/knownNames.ts's waitressNamesFromRows for why.
 */
export function itemCorrectionsFromRows(rows: string[][]): ItemCodeEntry[] {
  const byDescription = new Map<string, string>();

  for (const row of rows.slice(1)) {
    const itemCode = (row[ITEM_COL] ?? "").trim();
    if (!itemCode) continue;

    const description = (row[DESC_COL] ?? "").trim();
    if (description) byDescription.set(description, itemCode);

    const originalDescription = (row[ORIGINAL_DESC_COL] ?? "").trim();
    if (originalDescription) byDescription.set(originalDescription, itemCode);
  }

  return [...byDescription.entries()].map(([salesDesc, itemCode]) => ({
    category: "",
    salesDesc,
    itemCode,
  }));
}
