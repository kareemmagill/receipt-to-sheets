import { NextResponse, after } from "next/server";
import { readTab, appendRows, ensureTabExists } from "@/lib/googleSheets";
import { buildSalesOrderRows, mostRecentOrderDate } from "@/lib/salesOrderRows";
import { nextArNumberFromRows } from "@/lib/arNumber";
import { checkDuplicateSlip } from "@/lib/duplicateCheck";
import { uploadOrderPhoto } from "@/lib/googleDrive";
import { deleteOrderByArNumber } from "@/lib/deleteOrderByAr";
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
    const imageDataUrl: string | undefined = body?.imageDataUrl;
    // Set for two flows that both mean "replace this specific existing
    // order, not append a new one": the post-save summary screen's "Edit"
    // option, and "Update Record" when the scanned slip number already
    // exists (see below). Skips duplicateCheck -- this is a known,
    // intentional replacement, not an accidental re-scan to second-guess.
    // The old rows are deleted only after the new ones save successfully.
    const replaceArNumber: string | undefined = body?.replaceArNumber;

    if (!order) {
      return NextResponse.json({ ok: false, error: "Missing order" }, { status: 400 });
    }
    if (!order.items || order.items.length === 0) {
      return NextResponse.json({ ok: false, error: "Order has no items to save" }, { status: 400 });
    }
    if (!order.customer_suggested) {
      return NextResponse.json({ ok: false, error: "Missing customer" }, { status: 400 });
    }

    // Sales Orders is read once here and shared by both the duplicate check
    // and the AR-number computation below -- these used to each read the
    // tab separately (two full sequential round trips for the same data),
    // one of several redundant reads that made a save feel slow.
    const salesOrderRows = await readTab("Sales Orders");

    if (!replaceArNumber) {
      const duplicate = checkDuplicateSlip(order, salesOrderRows);
      if (duplicate.status === "exact" || duplicate.status === "conflict") {
        return NextResponse.json(
          {
            ok: false,
            exists: true,
            wasExact: duplicate.status === "exact",
            error: duplicate.message,
            existing: duplicate.existing,
          },
          { status: 409 }
        );
      }
    }

    // Computed fresh at save time — one AR number per order, applied to
    // every row of that order.
    const arNumber = nextArNumberFromRows(salesOrderRows);
    const rows = buildSalesOrderRows(order, arNumber, mostRecentOrderDate(salesOrderRows));

    // The Sales Orders write and the Drive photo upload are independent of
    // each other -- the previous version awaited them strictly in sequence
    // (sheet write, THEN wait for the full photo upload) even though
    // nothing requires that ordering. Running them concurrently means the
    // save only takes as long as the slower of the two, not the sum of
    // both -- the Drive upload is typically the slower one.
    const customerName = order.customer_suggested || order.customer_written;
    const [appendResult, photoResult] = await Promise.allSettled([
      appendRows("Sales Orders", rows),
      imageDataUrl
        ? uploadOrderPhoto({ imageDataUrl, fileName: buildPhotoFileName(order, arNumber) })
        : Promise.resolve(null),
    ]);

    // The Sales Orders write is the actual financial record -- unlike the
    // photo below, a failure here must fail the whole save.
    if (appendResult.status === "rejected") throw appendResult.reason;

    // Archiving the photo is a bonus, not part of the financial record — if
    // it fails, the sales order write above has already succeeded, so we
    // report a soft warning instead of failing the whole save.
    let photoWarning: string | undefined;
    let photoLink: string | undefined;
    if (imageDataUrl) {
      if (photoResult.status === "rejected") {
        photoWarning = photoResult.reason instanceof Error ? photoResult.reason.message : String(photoResult.reason);
      } else if (photoResult.value) {
        photoLink = photoResult.value.webViewLink;
        // The Photo Log row is an internal audit trail, not something the
        // UI waits on (it only needs photoLink, already set above) -- runs
        // after the response goes out so it doesn't add to the wait.
        const webViewLink = photoResult.value.webViewLink;
        after(async () => {
          try {
            await ensureTabExists(PHOTO_LOG_TAB, PHOTO_LOG_HEADER);
            await appendRows(PHOTO_LOG_TAB, [
              [arNumber, order.order_slip_number, customerName, new Date().toISOString(), webViewLink],
            ]);
          } catch {
            // Best-effort log row; nothing user-facing depends on it.
          }
        });
      }
    }

    // Only after the edited version is safely saved -- if this delete
    // failed instead, the old order would vanish with no replacement.
    // Worst case here is a leftover duplicate (the old rows), which is
    // recoverable; that's why this runs last, and best-effort like the
    // photo archive above.
    let replaceWarning: string | undefined;
    if (replaceArNumber) {
      try {
        await deleteOrderByArNumber(replaceArNumber);
      } catch (err) {
        replaceWarning = err instanceof Error ? err.message : String(err);
      }
    }

    return NextResponse.json({
      ok: true,
      rowsAdded: rows.length,
      arNumber,
      photoWarning,
      photoLink,
      replaceWarning,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
