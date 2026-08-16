import { NextResponse } from "next/server";
import { readTab } from "@/lib/googleSheets";

// Sales Orders columns: Name(0), Class(1), Order Slip Date(2), Order Slip
// Number(3), AR NO.(4) ... QTY(8) ... Description(11) ... Amount(13) -- see
// lib/duplicateCheck.ts for the full layout.
const NAME_COL = 0;
const DATE_COL = 2;
const SLIP_NUM_COL = 3;
const AR_COL = 4;
const QTY_COL = 8;
const DESC_COL = 11;
const AMOUNT_COL = 13;

// Photo Log columns -- see PHOTO_LOG_HEADER in app/api/save/route.ts.
const LOG_SLIP_COL = 1;
const LOG_PHOTO_LINK_COL = 4;

// Most recent records first, and capped -- this reads the live sheet on
// every request with no pagination, so it's meant for "does my last few
// test scans look right," not browsing the whole sheet (that's what Google
// Sheets itself is for).
const DEFAULT_LIMIT = 100;

interface Record {
  slipNumber: string;
  arNumber: string;
  customer: string;
  date: string;
  summary: string;
  total: number;
  rowCount: number;
  photoLink: string | null;
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
      date: (group[0][DATE_COL] ?? "").trim(),
      summary,
      total,
      rowCount: group.length,
      photoLink: null, // filled in by the caller, which has the Photo Log lookup
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

    // Photo Log doesn't exist until the first scan with a photo is saved
    // (see ensureTabExists in app/api/save/route.ts), so a missing tab here
    // just means "no photos archived yet," not an error worth failing on.
    try {
      const logRows = await readTab("Photo Log");
      const photoBySlipNumber = new Map<string, string>();
      for (const row of logRows.slice(1)) {
        const slipNumber = (row[LOG_SLIP_COL] ?? "").trim();
        const link = (row[LOG_PHOTO_LINK_COL] ?? "").trim();
        if (slipNumber && link) photoBySlipNumber.set(slipNumber, link);
      }
      for (const record of records) {
        if (record.slipNumber) record.photoLink = photoBySlipNumber.get(record.slipNumber) ?? null;
      }
    } catch {
      // No Photo Log tab yet -- leave every record's photoLink as null.
    }

    return NextResponse.json({ ok: true, records: records.slice(0, limit), totalRecords: records.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
