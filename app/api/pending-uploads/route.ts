import { NextResponse } from "next/server";
import { listPendingUploads, addPendingUpload } from "@/lib/pendingUploads";
import { uploadOrderPhoto } from "@/lib/googleDrive";
import { makeId } from "@/lib/makeId";

export async function GET() {
  try {
    const uploads = await listPendingUploads();
    return NextResponse.json({ ok: true, uploads });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Queues one photo for later processing -- the client has already resized
// it (see app/upload-slips/page.tsx), same 1568px cap as a live scan's
// OCR-read copy, since unlike the archival copy saved after a slip is
// digitized, this photo IS what OCR will read once someone processes the
// queue (Kareem, 2026-08-20).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const imageDataUrl: string | undefined = body?.imageDataUrl;
    const uploadedBy: string = (body?.uploadedBy ?? "").trim();
    const device: string = (body?.device ?? "").trim();

    if (!imageDataUrl) {
      return NextResponse.json({ ok: false, error: "imageDataUrl is required" }, { status: 400 });
    }

    const { webViewLink } = await uploadOrderPhoto({
      imageDataUrl,
      fileName: `pending_${makeId("slip")}.jpg`,
    });

    await addPendingUpload({ photoLink: webViewLink, uploadedBy, device });

    return NextResponse.json({ ok: true, photoLink: webViewLink });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
