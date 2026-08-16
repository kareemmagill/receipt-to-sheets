import { scoreAgainst, normalize } from "./fuzzyMatch";

export interface CustomerMatch {
  name: string;
  score: number; // 0 to 1, higher is closer
}

// Below this length, scoreAgainst's plain edit-distance similarity is too
// unreliable to trust for a person's name -- "ROB" is one substitution
// away from "BOB", "TOM" from "TIM", and those are different people, not
// misreads of each other, even though Levenshtein similarity rates them
// ~67% alike (found 2026-08-16: "Rob" auto-suggested "BOB FINLAYSON" at
// 66.7%, beating the real "ROBERT ..." candidates' legitimate 50% prefix
// match). A short written name is still trustworthy when it's cleanly the
// start of a longer candidate word, though -- that's the ordinary
// nickname/abbreviation case ("Rob" for "Robert"), not a coincidence -- so
// that always wins regardless of length, checked below before the length
// cutoff applies.
const MIN_LENGTH_FOR_FUZZY_MATCH = 4;

function isPrefixMatch(written: string, candidateWord: string): boolean {
  const a = normalize(written);
  const b = normalize(candidateWord);
  if (!a || !b) return false;
  return a.length <= b.length ? b.startsWith(a) : a.startsWith(b);
}

/**
 * Matches a handwritten name against a list of known customer names.
 * Also scores against each individual word (so "Bryan" scores well
 * against "Brian Smith") and takes the best of the two comparisons.
 */
export function matchCustomer(written: string, candidates: string[], topN = 6): CustomerMatch[] {
  if (!written.trim()) return [];
  const isShortWritten = normalize(written).length < MIN_LENGTH_FOR_FUZZY_MATCH;

  return candidates
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const trusted =
        !isShortWritten || isPrefixMatch(written, name) || name.split(" ").some((word) => isPrefixMatch(written, word));
      return { name, score: trusted ? scoreAgainst(written, name) : 0 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
