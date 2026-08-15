import { NextResponse } from "next/server";
import { appendRows, ensureTabExists } from "@/lib/googleSheets";
import { buildSalesOrderRows } from "@/lib/salesOrderRows";
import { getNextArNumber } from "@/lib/arNumber";
import { checkDuplicateSlip } from "@/lib/duplicateCheck";
import { uploadOrderPhoto } from "@/lib/googleDrive";
import type { EditableOrder } from "@/components/VerificationForm";

const PHOTO_LOG_TAB = "Photo Log";
const PHOTO_LOG_HEADER = ["AR Number", "Order Slip Number", "Customer", "Saved At", "Photo Link"];

// Named after the chit itself (its slip number + which physical form it is)
// rather than the AR number, since AR numbers are usually blank/uninformative
// (see lib/arNumber.ts) while the slip number is what's actually printed on
// the paper and what Kareem would search Drive for. "Bar"/"Restaurant" is
// per-item (an order can mix drinks and food), so this takes whichever class
// the first item ended up with as the slip's physical form -- true for the
// overwhelming majority of real chits, which are one form or the other, not
// worth blocking on for a filename. Falls back to the AR number, then a
// generic label, if the slip number was never read.
function buildPhotoFileName(order: EditableOrder, arNumber: string): string {
  const slipLabel = order.items[0]?.class === "Bar" ? "Bar" : order.items[0]?.class === "Restaurant" ? "Food" : "";
  const slipNumber = order.order_slip_number?.trim().replace(/[/\\]/g, "-");
  const base = slipNumber || arNumber || "slip";
  return `${base}${slipLabel ? `_${slipLabel}` : ""}.jpg`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const order: EditableOrder | undefined = body?.order;
    const force: boolean = body?.force === true;
    const imageDataUrl: string | undefined = body?.imageDataUrl;

    if (!order) {
      return NextResponse.json({ ok: false, error: "Missing order" }, { status: 400 });
    }
    if (!order.items || order.items.length === 0) {
      return NextResponse.json({ ok: false, error: "Order has no items to save" }, { status: 400 });
    }
    if (!order.customer_suggested) {
      return NextResponse.json({ ok: false, error: "Missing customer" }, { status: 400 });
    }

    if (!force) {
      const duplicate = await checkDuplicateSlip(order);
      if (duplicate.status === "exact") {
        return NextResponse.json(
          { ok: false, duplicate: true, error: duplicate.message },
          { status: 409 }
        );
      }
      if (duplicate.status === "conflict") {
        return NextResponse.json(
          { ok: false, conflict: true, error: duplicate.message, differences: duplicate.differences },
          { status: 409 }
        );
      }
    }

    // Computed fresh at save time — one AR number per order, applied to
    // every row of that order.
    const arNumber = await getNextArNumber();
    const rows = buildSalesOrderRows(order, arNumber);
    await appendRows("Sales Orders", rows);

    // Archiving the photo is a bonus, not part of the financial record — if
    // it fails, the sales order write above has already succeeded, so we
    // report a soft warning instead of failing the whole save.
    let photoWarning: string | undefined;
    if (imageDataUrl) {
      try {
        const customerName = order.customer_suggested || order.customer_written;
        const fileName = buildPhotoFileName(order, arNumber);
        const { webViewLink } = await uploadOrderPhoto({ imageDataUrl, fileName });

        await ensureTabExists(PHOTO_LOG_TAB, PHOTO_LOG_HEADER);
        await appendRows(PHOTO_LOG_TAB, [
          [arNumber, order.order_slip_number, customerName, new Date().toISOString(), webViewLink],
        ]);
      } catch (err) {
        photoWarning = err instanceof Error ? err.message : String(err);
      }
    }

    return NextResponse.json({ ok: true, rowsAdded: rows.length, arNumber, photoWarning });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
