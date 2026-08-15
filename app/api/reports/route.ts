import { NextResponse } from "next/server";
import { computeSalesReports } from "@/lib/reports";

export async function GET() {
  try {
    const { customerMonthly, itemMonthly, customerOrderLines } = await computeSalesReports();
    return NextResponse.json({ ok: true, customerMonthly, itemMonthly, customerOrderLines });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
