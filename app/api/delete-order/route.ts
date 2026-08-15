import { NextResponse } from "next/server";
import { deleteOrderByArNumber } from "@/lib/deleteOrderByAr";

// Used by the "Delete" option on the post-save summary screen -- deletes
// exactly the order just saved (by its AR number), not a positional
// heuristic. See lib/deleteOrderByAr.ts.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const arNumber: string | undefined = body?.arNumber;
    if (!arNumber) {
      return NextResponse.json({ ok: false, error: "Missing arNumber" }, { status: 400 });
    }

    const { deleted } = await deleteOrderByArNumber(arNumber);
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
