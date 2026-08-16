import { NextResponse } from "next/server";
import { readTab, deleteDataRows } from "@/lib/googleSheets";

// Wipes real sales data with no confirmation -- a local dev tool, never
// meant to be reachable once this is deployed anywhere real, regardless of
// what else is (or isn't) guarding the route.
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not available in production" }, { status: 404 });
  }

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
