import { NextResponse } from "next/server";
import { appendRows } from "@/lib/googleSheets";
import { buildSalesOrderRows } from "@/lib/salesOrderRows";
import type { EditableOrder } from "@/components/VerificationForm";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const order: EditableOrder | undefined = body?.order;

    if (!order) {
      return NextResponse.json({ ok: false, error: "Missing order" }, { status: 400 });
    }
    if (!order.items || order.items.length === 0) {
      return NextResponse.json({ ok: false, error: "Order has no items to save" }, { status: 400 });
    }

    const rows = buildSalesOrderRows(order);
    await appendRows("Sales Orders", rows);

    return NextResponse.json({ ok: true, rowsAdded: rows.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
