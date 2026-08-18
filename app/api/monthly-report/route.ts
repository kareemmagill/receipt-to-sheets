import { NextResponse } from "next/server";
import { computeMonthlyReport } from "@/lib/monthlyReport";

export async function GET(req: Request) {
  try {
    const month = new URL(req.url).searchParams.get("month") ?? undefined;
    const report = await computeMonthlyReport(month);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
