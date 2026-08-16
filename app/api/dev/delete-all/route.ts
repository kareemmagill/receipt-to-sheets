import { NextResponse } from "next/server";
import { readTab, deleteDataRows } from "@/lib/googleSheets";

// Wipes real sales data -- Kareem confirmed (2026-08-16) he wants this
// reachable in production, so the app-wide Basic Auth gate plus the
// UI's own double confirm() are the only safeguards left in front of it.
export async function POST() {
  try {
    const rows = await readTab("Sales Orders");
    const dataRowCount = rows.length - 1;

    if (dataRowCount <= 0) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    // Data rows start at sheet row 2 (row 1 is the header, always kept).
    await deleteDataRows("Sales Orders", 2, dataRowCount + 1);

    return NextResponse.json({ ok: true, deleted: dataRowCount });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
