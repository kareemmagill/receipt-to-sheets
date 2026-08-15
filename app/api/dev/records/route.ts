import { NextResponse } from "next/server";
import { readTab } from "@/lib/googleSheets";

// Sales Orders columns: Name(0) ... Order Slip Number(3), AR NO.(4) ... QTY(8)
// ... Description(11) ... Amount(13) -- see lib/duplicateCheck.ts for the
// full layout.
const NAME_COL = 0;
const SLIP_NUM_COL = 3;
const AR_COL = 4;
const QTY_COL = 8;
const DESC_COL = 11;
const AMOUNT_COL = 13;

// Most recent records first, and capped -- this reads the live sheet on
// every request with no pagination, so it's meant for "does my last few
// test scans look right," not browsing the whole sheet (that's what Google
// Sheets itself is for).
const DEFAULT_LIMIT = 100;

interface Record {
  slipNumber: string;
  arNumber: string;
  customer: string;
  summary: string;
  total: number;
  rowCount: number;
}

// Grouped the same way as app/api/dev/delete-last/route.ts: consecutive rows
// sharing a non-empty Order Slip Number are one record; a blank slip number
// is never grouped with its neighbors (real production data has thousands
// of legacy rows with blank AR numbers -- grouping blanks together would
// silently merge unrelated orders).
function buildRecords(dataRows: string[][]): Record[] {
  const records: Record[] = [];
  let i = 0;
  while (i < dataRows.length) {
    const slipNumber = (dataRows[i][SLIP_NUM_COL] ?? "").trim();
    const group = [dataRows[i]];
    i++;
    if (slipNumber) {
      while (i < dataRows.length && (dataRows[i][SLIP_NUM_COL] ?? "").trim() === slipNumber) {
        group.push(dataRows[i]);
        i++;
      }
    }

    const total = group.reduce((sum, r) => sum + (parseFloat(r[AMOUNT_COL]) || 0), 0);
    const summary = group
      .map((r) => `${(r[QTY_COL] ?? "").trim() || "?"}x${(r[DESC_COL] ?? "").trim() || "?"}`)
      .join(" ");

    records.push({
      slipNumber,
      arNumber: (group[0][AR_COL] ?? "").trim(),
      customer: (group[0][NAME_COL] ?? "").trim(),
      summary,
      total,
      rowCount: group.length,
    });
  }
  return records;
}

export async function GET(req: Request) {
  try {
    const limitParam = new URL(req.url).searchParams.get("limit");
    const limit = limitParam ? Math.max(1, Math.min(1000, Number(limitParam) || DEFAULT_LIMIT)) : DEFAULT_LIMIT;

    const rows = await readTab("Sales Orders");
    const records = buildRecords(rows.slice(1));
    records.reverse(); // most recent (bottom of sheet) first

    return NextResponse.json({ ok: true, records: records.slice(0, limit), totalRecords: records.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
