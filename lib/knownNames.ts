// Sales Orders columns: Name(0) ... Waitress(14), Member Status(15) -- see
// lib/duplicateCheck.ts for the full layout.
const NAME_COL = 0;
const WAITRESS_COL = 14;
const MEMBER_STATUS_COL = 15;

// A generic fallback name, not a real person -- never worth suggesting.
const WALK_IN_FALLBACK_NAME = "DIRECT SALES- WALK IN";

/**
 * Distinct waitress names that have actually been saved before -- since
 * that value only ever gets there via a real save (auto-read or manually
 * corrected by the reviewer), this list is self-correcting over time: fix
 * a misread name once, and it becomes a known name matchCustomer can
 * confidently suggest for the same handwriting next time.
 *
 * Takes already-fetched Sales Orders rows rather than reading the tab
 * itself -- callers needing both this and walkInNamesFromRows (or the item
 * corrections list) share one fetch instead of each re-reading the same
 * tab.
 */
// A person's name is never purely numeric -- guards against exactly what
// happened 2026-08-17, where a data-alignment bug (now fixed, see
// lib/googleSheets.ts's appendRows) put the Rate column's value in the
// Waitress column, and those numbers started showing up as name
// suggestions. Cheap, durable insurance against any future bad value
// landing in this column, not just that specific bug.
function looksLikeARealName(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

export function waitressNamesFromRows(rows: string[][]): string[] {
  const names = new Set<string>();
  for (const row of rows.slice(1)) {
    const name = (row[WAITRESS_COL] ?? "").trim();
    if (name && looksLikeARealName(name)) names.add(name);
  }
  return [...names];
}

/**
 * Distinct non-member ("walk-in") customer names from real saved orders --
 * there are few enough of these in practice that they're worth suggesting
 * even on a weak match, per Kareem (2026-08-15).
 */
export function walkInNamesFromRows(rows: string[][]): string[] {
  const names = new Set<string>();
  for (const row of rows.slice(1)) {
    const memberStatus = (row[MEMBER_STATUS_COL] ?? "").trim();
    const name = (row[NAME_COL] ?? "").trim();
    if (memberStatus === "Non-Member" && name && name !== WALK_IN_FALLBACK_NAME) {
      names.add(name);
    }
  }
  return [...names];
}
