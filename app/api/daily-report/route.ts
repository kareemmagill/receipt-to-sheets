import { NextResponse } from "next/server";
import { computeDailyReport } from "@/lib/dailyReport";

export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date") ?? undefined;
    const report = await computeDailyReport(date);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
