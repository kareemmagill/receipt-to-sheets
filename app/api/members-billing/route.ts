import { NextResponse } from "next/server";
import { membersBySpend } from "@/lib/membersBilling";

export async function GET() {
  try {
    const members = await membersBySpend();
    return NextResponse.json({ ok: true, members });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
