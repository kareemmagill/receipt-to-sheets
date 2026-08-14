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

// Below this, don't guess at all — the Item Code Template has real gaps
// (e.g. the actual "PGYC Club Sandwich" code isn't in it at all), and a
// wrong guess in real accounting data is worse than leaving it blank.
const ITEM_MATCH_THRESHOLD = 0.5;

// Above this, the match is confident enough not to need a second look
// (e.g. exact/near-exact hits like "SML" -> "SML IN CAN"). Between the two
// thresholds, still fill in the best guess but flag it for manual review —
// short, similar-looking names (like "SMA" vs "SMB LC") can otherwise score
// high enough to look confident while actually being wrong.
export const ITEM_MATCH_CONFIDENT_THRESHOLD = 0.85;

// Item Code Template columns: A=category, B=SalesDesc, ..., F=Item Code
export async function loadItemCodeTemplate(): Promise<ItemCodeEntry[]> {
  const rows = await readTab("Item Code Template");
  return rows
    .slice(1) // header row
    .filter((r) => r[1] && r[5])
    .map((r) => ({
      category: (r[0] ?? "").trim(),
      salesDesc: (r[1] ?? "").trim(),
      itemCode: (r[5] ?? "").trim(),
    }));
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
