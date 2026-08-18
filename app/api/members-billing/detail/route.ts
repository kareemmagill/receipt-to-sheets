import { NextResponse } from "next/server";
import { memberBillingDetail } from "@/lib/membersBilling";

export async function GET(req: Request) {
  try {
    const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
    if (!name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const detail = await memberBillingDetail(name);
    return NextResponse.json({ ok: true, detail });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
