import { readTab } from "./googleSheets";

// Column E (0-indexed 4) in Sales Orders: AR NO.
const AR_COLUMN_INDEX = 4;

/**
 * AR numbers are assigned automatically, not read off the slip — this finds
 * the highest existing "AR####" in the sheet and returns the next one,
 * matching the zero-padding width already in use.
 */
export async function getNextArNumber(): Promise<string> {
  const rows = await readTab("Sales Orders");

  let maxNum = 0;
  let width = 4;

  for (const row of rows.slice(1)) {
    const raw = (row[AR_COLUMN_INDEX] ?? "").trim();
    const match = raw.match(/^AR(\d+)$/i);
    if (!match) continue;

    const num = parseInt(match[1], 10);
    if (num > maxNum) {
      maxNum = num;
      width = match[1].length;
    }
  }

  const next = maxNum + 1;
  return `AR${String(next).padStart(width, "0")}`;
}
