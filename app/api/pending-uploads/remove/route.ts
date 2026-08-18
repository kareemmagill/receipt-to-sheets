import { NextResponse } from "next/server";
import { removePendingUpload } from "@/lib/pendingUploads";

// Called once a queued photo has been successfully digitized and saved
// (see app/page.tsx's pending-upload handoff) -- a row's presence in the
// Pending Uploads tab IS the "still pending" state, so processing removes
// it rather than flipping a status column.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rowNumber: number | undefined = body?.rowNumber;
    if (!rowNumber) {
      return NextResponse.json({ ok: false, error: "rowNumber is required" }, { status: 400 });
    }

    await removePendingUpload(rowNumber);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
