import { NextResponse } from "next/server";
import { readTab, deleteDataRows } from "@/lib/googleSheets";

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
