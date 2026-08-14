import { NextResponse } from "next/server";
import { readTab } from "@/lib/googleSheets";

export async function GET() {
  try {
    const customers = await readTab("Customers");
    const salesOrders = await readTab("Sales Orders");

    return NextResponse.json({
      ok: true,
      customers: {
        rowCount: customers.length,
        firstFewRows: customers.slice(0, 5),
      },
      salesOrders: {
        rowCount: salesOrders.length,
        firstFewRows: salesOrders.slice(0, 5),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
