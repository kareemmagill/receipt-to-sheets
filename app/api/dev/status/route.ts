import { NextResponse } from "next/server";
import { readTab } from "@/lib/googleSheets";

// Sales Orders columns: Name(0) ... Order Slip Number(3), AR NO.(4) -- see
// lib/duplicateCheck.ts for the full layout. Grouped by Order Slip Number,
// not AR NO. -- see app/api/dev/delete-last/route.ts for why.
const NAME_COL = 0;
const SLIP_NUM_COL = 3;
const AR_COL = 4;

export async function GET() {
  try {
    const rows = await readTab("Sales Orders");
    const dataRows = rows.slice(1);

    if (dataRows.length === 0) {
      return NextResponse.json({ ok: true, totalRows: 0, lastOrder: null });
    }

    const lastSlipNum = (dataRows[dataRows.length - 1][SLIP_NUM_COL] ?? "").trim();
    let itemCount = 1;
    if (lastSlipNum) {
      itemCount = 0;
      for (let i = dataRows.length - 1; i >= 0; i--) {
        if ((dataRows[i][SLIP_NUM_COL] ?? "").trim() !== lastSlipNum) break;
        itemCount++;
      }
    }

    const lastRow = dataRows[dataRows.length - 1];
    const customer = (lastRow[NAME_COL] ?? "").trim();
    const arNumber = (lastRow[AR_COL] ?? "").trim();

    return NextResponse.json({
      ok: true,
      totalRows: dataRows.length,
      lastOrder: { slipNumber: lastSlipNum, arNumber, customer, itemCount },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
