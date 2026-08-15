import { scoreAgainst } from "./fuzzyMatch";

// Pure matching/scoring logic, split out of lib/itemCodeMatch.ts so it can
// be imported from client components too (components/VerificationForm.tsx
// re-matches live as the description is retyped) without pulling in
// lib/googleSheets.ts's server-only googleapis dependency.

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
export const ITEM_MATCH_THRESHOLD = 0.5;

// Above this, the match is confident enough not to need a second look
// (e.g. exact/near-exact hits like "SML" -> "SML IN CAN"). Between the two
// thresholds, still fill in the best guess but flag it for manual review —
// short, similar-looking names (like "SMA" vs "SMB LC") can otherwise score
// high enough to look confident while actually being wrong.
export const ITEM_MATCH_CONFIDENT_THRESHOLD = 0.85;

// Handwritten shorthand that doesn't lexically resemble its real Inventory
// description closely enough for scoreAgainst's string similarity to find
// confidently on its own -- confirmed against real Inventory rows: SMB34
// "San Miguel Beer Bottle", SML35 "San Miguel Light Bottle". Staff also
// write "SMP" for the same beer as "SMB" (both alias to the SMB34 row).
// Exact-match only, not a prefix check -- "SMH" (Smoked Ham, a real
// Inventory item) also starts with "SM" but isn't a San Miguel product at
// all, so a blanket "SM*" rule would misfile it as a beer.
const KNOWN_ABBREVIATIONS: Record<string, string> = {
  SMB: "SAN MIGUEL BEER BOTTLE",
  SMP: "SAN MIGUEL BEER BOTTLE",
  SML: "SAN MIGUEL LIGHT BOTTLE",
};

export function matchItemCodeCandidates(written: string, entries: ItemCodeEntry[], topN = 5): ItemCodeMatch[] {
  if (!written.trim() || entries.length === 0) return [];

  const alias = KNOWN_ABBREVIATIONS[written.trim().toUpperCase()];
  const scoreEntry = (entry: ItemCodeEntry) => {
    const direct = scoreAgainst(written, entry.salesDesc);
    return alias ? Math.max(direct, scoreAgainst(alias, entry.salesDesc)) : direct;
  };

  const seenCodes = new Set<string>();
  const deduped: ItemCodeMatch[] = [];
  // The Inventory tab has genuine duplicate rows (the same item code listed
  // more than once). Sorting first means the highest-scoring copy of a
  // duplicated code wins; dedup avoids showing the same suggestion chip
  // twice (and a React key collision).
  for (const match of entries
    .map((entry) => ({ entry, score: scoreEntry(entry) }))
    .sort((a, b) => b.score - a.score)) {
    if (seenCodes.has(match.entry.itemCode)) continue;
    seenCodes.add(match.entry.itemCode);
    deduped.push(match);
    if (deduped.length >= topN) break;
  }
  return deduped;
}

export function matchItemCode(written: string, entries: ItemCodeEntry[]): ItemCodeMatch | null {
  const [best] = matchItemCodeCandidates(written, entries, 1);
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
  "SMP",
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
