import { readTab } from "./googleSheets";
import type { ItemCodeEntry } from "./itemCodeScoring";

// Re-exported for existing server-side consumers (e.g. app/api/extract/
// route.ts) -- the actual pure matching logic lives in ./itemCodeScoring so
// it can also be imported from client components, which can't pull in this
// file's readTab/googleapis dependency.
export * from "./itemCodeScoring";

// Inventory columns: A=(unused), B=Item code, C=Description. Far more
// complete than the "Item Code Template" tab (1165 rows vs 204 — e.g. it
// actually has the real "MACLU6" code for "PGYC Club Sandwich", which the
// template tab was missing entirely). Some codes carry a "CATEGORY:" prefix
// (only ~6% of rows, inconsistently — some codes appear both with and
// without it), which is used as a bonus category signal when present but
// never required, since slip_type (Bar vs Restaurant, from the physical
// slip's own heading) is the primary class signal now.
export async function loadItemCodeTemplate(): Promise<ItemCodeEntry[]> {
  const rows = await readTab("Inventory");
  return rows
    .slice(1) // header row
    .filter((r) => r[1] && r[2])
    .map((r) => {
      const raw = (r[1] ?? "").trim();
      const colonIndex = raw.indexOf(":");
      const category = colonIndex === -1 ? "" : raw.slice(0, colonIndex).trim();
      const itemCode = colonIndex === -1 ? raw : raw.slice(colonIndex + 1).trim();
      return { category, salesDesc: (r[2] ?? "").trim(), itemCode };
    });
}
