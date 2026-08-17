import { scoreAgainst, normalize } from "./fuzzyMatch";

export interface CustomerMatch {
  name: string;
  score: number; // 0 to 1, higher is closer
}

// Sales Orders columns: Name(0) ... Order Slip Number(3) -- see
// lib/duplicateCheck.ts for the full layout.
const NAME_COL = 0;
const SLIP_NUM_COL = 3;

/**
 * How many distinct past orders (by slip number) each customer name has
 * on record -- used by matchCustomer below to break ties among several
 * equally-plausible fuzzy matches. Real case, Kareem 2026-08-17: "Rob"
 * scores identically against every "ROBERT ..." member (the shared first
 * word dominates the match), so without this the pick is arbitrary sheet
 * order; whichever of them has actually shown up before is the more
 * likely real match. Counts distinct slip numbers, not raw rows, so one
 * big multi-item order doesn't outweigh someone who's genuinely visited
 * more often.
 *
 * Takes already-fetched Sales Orders rows rather than reading the tab
 * itself -- see lib/knownNames.ts's waitressNamesFromRows for why.
 */
export function customerActivityCounts(rows: string[][]): Map<string, number> {
  const slipsByCustomer = new Map<string, Set<string>>();
  for (const row of rows.slice(1)) {
    const name = (row[NAME_COL] ?? "").trim();
    const slip = (row[SLIP_NUM_COL] ?? "").trim();
    if (!name || !slip) continue;
    if (!slipsByCustomer.has(name)) slipsByCustomer.set(name, new Set());
    slipsByCustomer.get(name)!.add(slip);
  }
  const counts = new Map<string, number>();
  for (const [name, slips] of slipsByCustomer) counts.set(name, slips.size);
  return counts;
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
// Scores within this of each other are treated as tied for ranking
// purposes -- scoreAgainst can produce near-identical floats for
// genuinely-tied candidates (e.g. two names of different lengths that
// both match written text via the same best-word comparison).
const TIE_EPSILON = 0.001;

export function matchCustomer(
  written: string,
  candidates: string[],
  topN = 6,
  activityCounts?: Map<string, number>
): CustomerMatch[] {
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
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) > TIE_EPSILON) return b.score - a.score;
      // Tied on text similarity -- prefer whoever's actually a more
      // active customer, not just whichever came first in the sheet.
      const countA = activityCounts?.get(a.name) ?? 0;
      const countB = activityCounts?.get(b.name) ?? 0;
      return countB - countA || b.score - a.score;
    })
    .slice(0, topN);
}
