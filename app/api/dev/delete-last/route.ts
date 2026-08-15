import { NextResponse } from "next/server";
import { readTab, deleteDataRows } from "@/lib/googleSheets";

// Sales Orders columns: Name(0) ... Order Slip Number(3), AR NO.(4) -- see
// lib/duplicateCheck.ts for the full layout.
const NAME_COL = 0;
const SLIP_NUM_COL = 3;
const AR_COL = 4;

// "Last record" = every row belonging to the most recently saved order, not
// just the last physical row -- an order with several line items appends
// several rows together (see lib/salesOrderRows.ts), and that's what a
// person means by "the last scan," not "the last item of it."
//
// Grouped by Order Slip Number, not AR NO. -- confirmed against the real
// sheet (2026-08-15): AR NO. is blank for every existing row (this data
// predates the app's own AR-numbering), while Order Slip Number reliably
// ties an order's line items together (e.g. two rows both "34840" for one
// customer's order). If AR NO. does get populated by future app saves,
// grouping still works the same way since both columns move together.
//
// If the last row's slip number is blank, don't group at all -- treat it as
// a single row. Trusting a shared blank to mean "same order" would silently
// sweep in every other blank-slip-number row above it too.
export async function POST() {
  try {
    const rows = await readTab("Sales Orders");
    const dataRows = rows.slice(1);

    if (dataRows.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const lastSlipNum = (dataRows[dataRows.length - 1][SLIP_NUM_COL] ?? "").trim();
    let count = 1;
    if (lastSlipNum) {
      count = 0;
      for (let i = dataRows.length - 1; i >= 0; i--) {
        if ((dataRows[i][SLIP_NUM_COL] ?? "").trim() !== lastSlipNum) break;
        count++;
      }
    }

    const lastRow = dataRows[dataRows.length - 1];
    const customer = (lastRow[NAME_COL] ?? "").trim();
    const arNumber = (lastRow[AR_COL] ?? "").trim();

    // Data rows start at sheet row 2 (row 1 is the header).
    const endRow = dataRows.length + 1;
    const startRow = endRow - count + 1;
    await deleteDataRows("Sales Orders", startRow, endRow);

    return NextResponse.json({ ok: true, deleted: count, slipNumber: lastSlipNum, arNumber, customer });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
