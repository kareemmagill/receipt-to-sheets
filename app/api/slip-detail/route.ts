import { NextResponse } from "next/server";
import { readTab } from "@/lib/googleSheets";
import { findExistingOrderBySlip } from "@/lib/duplicateCheck";
import { photoLinksBySlipNumber } from "@/lib/photoLog";

// Backs the Daily Report page's slip-number click -- looks a slip back up
// by number alone (no slip type on hand there, only the number shown in
// the table) so the click can open both the saved photo and the same
// digitised SlipLayout used on the Duplicate Slip screen (Kareem,
// 2026-08-18: "open the saved image AND the digitised version").
export async function GET(req: Request) {
  try {
    const slipNumber = new URL(req.url).searchParams.get("slipNumber")?.trim() ?? "";
    if (!slipNumber) {
      return NextResponse.json({ ok: false, error: "slipNumber is required" }, { status: 400 });
    }

    const salesOrderRows = await readTab("Sales Orders");
    const existing = findExistingOrderBySlip("", slipNumber, salesOrderRows);

    if (!existing) {
      return NextResponse.json({ ok: true, existing: null });
    }

    const photoInfo = (await photoLinksBySlipNumber()).get(slipNumber);

    return NextResponse.json({
      ok: true,
      existing: { ...existing, photoLink: photoInfo?.photoLink, photoThumbnailUrl: photoInfo?.photoThumbnailUrl },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
