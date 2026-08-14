import { readTab } from "./googleSheets";
import { scoreAgainst } from "./fuzzyMatch";

export interface ItemCodeEntry {
  category: string;
  salesDesc: string;
  itemCode: string;
}

export interface ItemCodeMatch {
  entry: ItemCodeEntry;
  score: number;
}

// Below this, don't guess at all — a wrong guess in real accounting data is
// worse than leaving it blank.
const ITEM_MATCH_THRESHOLD = 0.5;

// Above this, the match is confident enough not to need a second look
// (e.g. exact/near-exact hits like "SML" -> "SML IN CAN"). Between the two
// thresholds, still fill in the best guess but flag it for manual review —
// short, similar-looking names (like "SMA" vs "SMB LC") can otherwise score
// high enough to look confident while actually being wrong.
export const ITEM_MATCH_CONFIDENT_THRESHOLD = 0.85;

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

export function matchItemCode(written: string, entries: ItemCodeEntry[]): ItemCodeMatch | null {
  if (!written.trim() || entries.length === 0) return null;

  let best: ItemCodeMatch | null = null;
  for (const entry of entries) {
    const score = scoreAgainst(written, entry.salesDesc);
    if (!best || score > best.score) best = { entry, score };
  }
  return best && best.score >= ITEM_MATCH_THRESHOLD ? best : null;
}

const BAR_CATEGORY_KEYWORDS = ["BEER", "BAR", "COCKTAIL", "WINE", "HARD DRINK"];

// Common Philippine bar-menu abbreviations/terms, used only when no
// confident item-code match was found to still guess Restaurant vs Bar.
const BAR_KEYWORD_FALLBACK = [
  "BEER",
  "SAN MIG",
  "SMA",
  "SMB",
  "SML",
  "HEINEKEN",
  "TIGER",
  "RED HORSE",
  "REDHORSE",
  "GIN",
  "VODKA",
  "RHUM",
  "RUM",
  "WHISK",
  "TEQUILA",
  "BRANDY",
  "COCKTAIL",
  "WINE",
  "SOJU",
  "HIGH BALL",
  "HIGHBALL",
  "SHOT",
];

export function guessClass(written: string, category?: string): "Restaurant" | "Bar" {
  if (category) {
    const upper = category.toUpperCase();
    if (BAR_CATEGORY_KEYWORDS.some((k) => upper.includes(k))) return "Bar";
    return "Restaurant";
  }

  const upperWritten = written.toUpperCase();
  if (BAR_KEYWORD_FALLBACK.some((k) => upperWritten.includes(k))) return "Bar";
  return "Restaurant";
}
