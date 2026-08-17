import { NextResponse } from "next/server";
import { apiUsageSummary } from "@/lib/apiUsageLog";

export async function GET() {
  try {
    const summary = await apiUsageSummary();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
