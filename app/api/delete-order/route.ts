import { NextResponse } from "next/server";
import { deleteOrderBySlipNumber } from "@/lib/deleteOrderBySlip";

// Used by the "Delete" option on the post-save summary screen -- deletes
// exactly the order just saved (by its slip number), not a positional
// heuristic. See lib/deleteOrderBySlip.ts.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const slipNumber: string | undefined = body?.slipNumber;
    if (!slipNumber) {
      return NextResponse.json({ ok: false, error: "Missing slipNumber" }, { status: 400 });
    }

    const { deleted } = await deleteOrderBySlipNumber(slipNumber);
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
