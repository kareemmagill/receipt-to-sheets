import { NextResponse } from "next/server";
import { readTab } from "@/lib/googleSheets";
import { findExistingOrderBySlip } from "@/lib/duplicateCheck";
import { photoLinksBySlipNumber } from "@/lib/photoLog";

// Called right after OCR extraction, before the reviewer sees the
// verification form -- lets the "Slip Already Recorded" screen catch an
// accidental re-scan immediately instead of only after a full review
// (Kareem, 2026-08-17).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const slipType: string = (body?.slipType ?? "").trim();
    const slipNumber: string = (body?.slipNumber ?? "").trim();

    if (!slipNumber) {
      return NextResponse.json({ ok: true, existing: null });
    }

    const salesOrderRows = await readTab("Sales Orders");
    const existing = findExistingOrderBySlip(slipType, slipNumber, salesOrderRows);

    if (!existing) {
      return NextResponse.json({ ok: true, existing: null });
    }

    // Best-effort photo link -- Photo Log may not exist yet, or this row
    // may predate it (no photo was ever archived when it was saved).
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
