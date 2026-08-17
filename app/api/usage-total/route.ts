import { NextResponse } from "next/server";
import { totalApiCost } from "@/lib/apiUsageLog";

export async function GET() {
  try {
    const totalUsd = await totalApiCost();
    return NextResponse.json({ ok: true, totalUsd });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
