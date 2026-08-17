// Self-correcting price reference, built purely from past saved orders --
// same idea as lib/itemCorrections.ts and lib/knownNames.ts: whatever rate
// actually landed in the sheet for a given item code + Member/Non-Member
// combo becomes "the known price" for that combo from then on. No manually
// maintained price sheet needed. Last save wins per combo, so a genuine
// price change (the club's own doing, or supplier-driven, per Kareem
// 2026-08-17: "prices might change outside the club's control") takes over
// once it's actually been saved once -- this is a *flag for review* signal,
// never an auto-correction, precisely because a differing price might be
// completely legitimate rather than an OCR misread.
const ITEM_COL = 10;
const RATE_COL = 12;
const MEMBER_STATUS_COL = 15;

export function priceHistoryFromRows(rows: string[][]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows.slice(1)) {
    const itemCode = (row[ITEM_COL] ?? "").trim();
    const memberStatus = (row[MEMBER_STATUS_COL] ?? "").trim();
    const rate = parseFloat(row[RATE_COL]);
    if (!itemCode) continue;
    if (memberStatus !== "Member" && memberStatus !== "Non-Member") continue;
    if (!Number.isFinite(rate) || rate <= 0) continue;
    map.set(`${itemCode}||${memberStatus}`, rate);
  }
  return map;
}

export function knownPrice(priceHistory: Map<string, number>, itemCode: string, memberStatus: string): number | null {
  return priceHistory.get(`${itemCode}||${memberStatus}`) ?? null;
}
