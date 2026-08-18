import { NextResponse } from "next/server";
import { listPendingUploads, addPendingUpload } from "@/lib/pendingUploads";

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

// Appends one row to the Pending Uploads tab for a photo already uploaded
// to Drive via POST /api/pending-uploads/upload-photo. Kept as its own,
// separate step (not doing the Drive upload here too) so the client can
// call the Drive upload with real concurrency while still only ever
// calling this one sequentially -- see that route's comment for why.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const photoLink: string | undefined = body?.photoLink;
    const uploadedBy: string = (body?.uploadedBy ?? "").trim();
    const device: string = (body?.device ?? "").trim();

    if (!photoLink) {
      return NextResponse.json({ ok: false, error: "photoLink is required" }, { status: 400 });
    }

    await addPendingUpload({ photoLink, uploadedBy, device });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
