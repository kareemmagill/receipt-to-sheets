export interface CustomerMatch {
  name: string;
  score: number; // 0 to 1, higher is closer
}

function normalize(s: string): string {
  return s
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Matches a handwritten name against a list of known customer names.
 * Also scores against each individual word (so "Bryan" scores well
 * against "Brian Smith") and takes the best of the two comparisons.
 */
export function matchCustomer(written: string, candidates: string[], topN = 3): CustomerMatch[] {
  const target = normalize(written);
  if (!target) return [];

  const scored = candidates
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const normalizedName = normalize(name);
      const wholeScore = similarity(target, normalizedName);
      const wordScores = normalizedName.split(" ").map((word) => similarity(target, word));
      const bestWordScore = wordScores.length ? Math.max(...wordScores) : 0;
      return { name, score: Math.max(wholeScore, bestWordScore) };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}
