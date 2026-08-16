export function normalize(s: string): string {
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
 * Scores how well `written` matches `candidateText`, checking both the
 * whole string and each individual word (so "SML" scores well against
 * "SML IN CAN", or "Bryan" against "Brian Smith").
 */
export function scoreAgainst(written: string, candidateText: string): number {
  const target = normalize(written);
  const candidate = normalize(candidateText);
  if (!target || !candidate) return 0;

  const whole = similarity(target, candidate);
  const words = candidate.split(" ");
  const bestWord = words.length ? Math.max(...words.map((w) => similarity(target, w))) : 0;
  return Math.max(whole, bestWord);
}
