import { NextResponse } from "next/server";
import { appendRows } from "@/lib/googleSheets";
import { buildSalesOrderRows } from "@/lib/salesOrderRows";
import { getNextArNumber } from "@/lib/arNumber";
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
    if (!order.customer_suggested) {
      return NextResponse.json({ ok: false, error: "Missing customer" }, { status: 400 });
    }

    // Computed fresh at save time — one AR number per order, applied to
    // every row of that order.
    const arNumber = await getNextArNumber();
    const rows = buildSalesOrderRows(order, arNumber);
    await appendRows("Sales Orders", rows);

    return NextResponse.json({ ok: true, rowsAdded: rows.length, arNumber });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
