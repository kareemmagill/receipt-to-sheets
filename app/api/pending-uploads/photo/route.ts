import { NextResponse } from "next/server";
import { findPendingUpload, driveFileIdFromPhotoLink } from "@/lib/pendingUploads";
import { downloadFileAsDataUrl } from "@/lib/googleDrive";

// Reads a queued photo's bytes back out of Drive as a data URL, server-
// side, so the Process Queue page never has to fetch a cross-origin Drive
// URL itself -- see lib/googleDrive.ts's downloadFileAsDataUrl.
export async function GET(req: Request) {
  try {
    const rowNumberParam = new URL(req.url).searchParams.get("rowNumber");
    const rowNumber = rowNumberParam ? Number(rowNumberParam) : NaN;
    if (!Number.isFinite(rowNumber)) {
      return NextResponse.json({ ok: false, error: "rowNumber is required" }, { status: 400 });
    }

    const entry = await findPendingUpload(rowNumber);
    if (!entry) {
      return NextResponse.json({ ok: false, error: "No pending upload at that row" }, { status: 404 });
    }

    const fileId = driveFileIdFromPhotoLink(entry.photoLink);
    if (!fileId) {
      return NextResponse.json({ ok: false, error: "Could not resolve this photo's Drive file" }, { status: 500 });
    }

    const imageDataUrl = await downloadFileAsDataUrl(fileId);
    return NextResponse.json({ ok: true, imageDataUrl });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
