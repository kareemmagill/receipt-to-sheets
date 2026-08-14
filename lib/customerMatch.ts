import { scoreAgainst } from "./fuzzyMatch";

export interface CustomerMatch {
  name: string;
  score: number; // 0 to 1, higher is closer
}

/**
 * Matches a handwritten name against a list of known customer names.
 * Also scores against each individual word (so "Bryan" scores well
 * against "Brian Smith") and takes the best of the two comparisons.
 */
export function matchCustomer(written: string, candidates: string[], topN = 6): CustomerMatch[] {
  if (!written.trim()) return [];

  return candidates
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, score: scoreAgainst(written, name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
