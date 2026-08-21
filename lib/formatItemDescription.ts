// Inventory / Item Code Template descriptions mark a Happy Hour price with
// a trailing "HH" (e.g. "SM APPLE HH", "SML HH") -- confirmed by Kareem,
// 2026-08-21: "anytime there is an HH behind a item, its a happy hour
// price", a general rule, not specific to any one item code. Purely a
// display transform: never changes the stored description or item code
// itself (still exactly what the Inventory sheet or the reviewer's own
// edit has), only how it reads wherever it's shown to a person.
export function formatItemDescription(description: string): string {
  const match = description.match(/^(.*\S)\s+HH$/i);
  if (!match) return description;
  return `${match[1]} (Happy Hour)`;
}
