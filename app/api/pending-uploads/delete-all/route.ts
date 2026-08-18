import { NextResponse } from "next/server";
import { removeAllPendingUploads } from "@/lib/pendingUploads";

export async function POST() {
  try {
    const deleted = await removeAllPendingUploads();
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
