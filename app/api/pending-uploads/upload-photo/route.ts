import { NextResponse } from "next/server";
import { uploadOrderPhoto } from "@/lib/googleDrive";
import { makeId } from "@/lib/makeId";

// Just the Drive upload -- split out from POST /api/pending-uploads (which
// also appends a row to the Pending Uploads sheet tab) so the client can
// call this one with real concurrency. Uploading several photos to Drive
// at once is safe (independent file creations, no shared state); the
// sheet append is not (see lib/googleSheets.ts's appendRows -- it reads
// the tab's current length then writes at that computed row, so two
// concurrent appends can compute the same "next row" and collide). The
// client chains that step sequentially instead (Kareem, 2026-08-20: "if
// parallel uploading is possible then use it").
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const imageDataUrl: string | undefined = body?.imageDataUrl;

    if (!imageDataUrl) {
      return NextResponse.json({ ok: false, error: "imageDataUrl is required" }, { status: 400 });
    }

    const { webViewLink } = await uploadOrderPhoto({
      imageDataUrl,
      fileName: `pending_${makeId("slip")}.jpg`,
    });

    return NextResponse.json({ ok: true, photoLink: webViewLink });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
