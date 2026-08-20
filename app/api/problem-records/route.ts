import { NextResponse } from "next/server";
import { readTab } from "@/lib/googleSheets";
import { findProblemSlips } from "@/lib/problemRecords";

// Backs the "Review Problem Records" button on the landing page and its
// own page -- lists every saved slip that still has at least one item
// flagged via the verification form's Problem button (Kareem, 2026-08-20).
export async function GET() {
  try {
    const rows = await readTab("Sales Orders");
    const slips = findProblemSlips(rows);
    return NextResponse.json({ ok: true, slips });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
