import { NextResponse } from "next/server";
import { readTab } from "@/lib/googleSheets";
import { findExistingOrderBySlip } from "@/lib/duplicateCheck";
import { driveThumbnailUrl } from "@/lib/googleDrive";

// Photo Log columns -- see PHOTO_LOG_HEADER in app/api/save/route.ts.
const LOG_SLIP_COL = 1;
const LOG_PHOTO_LINK_COL = 4;

// Extracts the file ID out of a Drive webViewLink like
// https://drive.google.com/file/d/FILE_ID/view?usp=drivesdk
const DRIVE_FILE_ID_REGEX = /\/d\/([a-zA-Z0-9_-]+)/;

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
    // may predate it (no photo was ever archived when it was saved). Most
    // recent entry wins if the same slip number was ever logged more than
    // once.
    let photoLink: string | undefined;
    let photoThumbnailUrl: string | undefined;
    try {
      const logRows = await readTab("Photo Log");
      const match = [...logRows.slice(1)].reverse().find((row) => (row[LOG_SLIP_COL] ?? "").trim() === slipNumber);
      photoLink = (match?.[LOG_PHOTO_LINK_COL] ?? "").trim() || undefined;
      const fileId = photoLink?.match(DRIVE_FILE_ID_REGEX)?.[1];
      if (fileId) photoThumbnailUrl = driveThumbnailUrl(fileId);
    } catch {
      // No Photo Log tab yet -- fine, just nothing to link to.
    }

    return NextResponse.json({ ok: true, existing: { ...existing, photoLink, photoThumbnailUrl } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
