import { NextResponse } from "next/server";
import { readTab } from "@/lib/googleSheets";
import { itemCodeTemplateFromRows, type ItemCodeEntry } from "@/lib/itemCodeMatch";
import { itemCorrectionsFromRows } from "@/lib/itemCorrections";
import { waitressNamesFromRows, walkInNamesFromRows } from "@/lib/knownNames";
import { photoLinksBySlipNumber } from "@/lib/photoLog";
import { driveFileIdFromPhotoLink } from "@/lib/pendingUploads";
import { downloadFileAsDataUrl } from "@/lib/googleDrive";
import { makeId } from "@/lib/makeId";
import type { OrderSlipExtraction } from "@/lib/extractSchema";
import type { EditableItem, EditableOrder } from "@/components/VerificationForm";

// Sales Orders columns -- see lib/duplicateCheck.ts for the full layout.
const NAME_COL = 0;
const CLASS_COL = 1;
const DATE_COL = 2;
const SLIP_NUM_COL = 3;
const TERMS_COL = 5;
const MEMO_COL = 6;
const QTY_COL = 8;
const INVOICE_CLASS_COL = 9;
const ITEM_COL = 10;
const DESC_COL = 11;
const RATE_COL = 12;
const AMOUNT_COL = 13;
const WAITRESS_COL = 14;
const MEMBER_STATUS_COL = 15;
const ORIGINAL_DESCRIPTION_COL = 19;
const PROBLEM_COL = 20;

// Loads one already-saved slip back into the exact same shape the
// verification form works with, for the Review Problem Records page's
// "Open" flow (Kareem, 2026-08-20: "the user can edit and approve the
// slip"). Not a re-run of OCR -- this reads what's already in the sheet,
// same as /api/slip-detail, but returns the fuller EditableOrder shape
// (item codes, rate, original description, problem flags) that
// VerificationForm needs to actually edit + re-save, not just display.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slipNumber = url.searchParams.get("slipNumber")?.trim() ?? "";
    const slipType = url.searchParams.get("slipType")?.trim() ?? "";
    if (!slipNumber) {
      return NextResponse.json({ ok: false, error: "slipNumber is required" }, { status: 400 });
    }

    const salesOrderRows = await readTab("Sales Orders");
    const numberMatches = salesOrderRows.slice(1).filter((r) => (r[SLIP_NUM_COL] ?? "").trim() === slipNumber);
    const typeMatches = slipType ? numberMatches.filter((r) => (r[CLASS_COL] ?? "").trim() === slipType) : numberMatches;
    const rows = typeMatches.length > 0 ? typeMatches : numberMatches;
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, order: null });
    }

    const [inventoryResult, customersResult, photoResult] = await Promise.allSettled([
      readTab("Inventory"),
      readTab("Customers"),
      (async () => {
        const photoInfo = (await photoLinksBySlipNumber()).get(slipNumber);
        if (!photoInfo) return null;
        const fileId = driveFileIdFromPhotoLink(photoInfo.photoLink);
        if (!fileId) return null;
        return await downloadFileAsDataUrl(fileId);
      })(),
    ]);

    let itemTemplate: ItemCodeEntry[] = [];
    try {
      const template = inventoryResult.status === "fulfilled" ? itemCodeTemplateFromRows(inventoryResult.value) : [];
      const corrections = itemCorrectionsFromRows(salesOrderRows);
      itemTemplate = [...corrections, ...template];
    } catch {
      // fall through with an empty template
    }

    const customerList =
      customersResult.status === "fulfilled"
        ? customersResult.value.map((row) => row[0]).filter((name): name is string => Boolean(name?.trim()))
        : [];
    const waitressList = waitressNamesFromRows(salesOrderRows);
    const walkinList = walkInNamesFromRows(salesOrderRows);
    const imageDataUrl = photoResult.status === "fulfilled" ? photoResult.value : null;

    const first = rows[0];
    const customerName = (first[NAME_COL] ?? "").trim();
    const memberStatus = (first[MEMBER_STATUS_COL] ?? "").trim();

    const items: EditableItem[] = rows.map((r) => ({
      id: makeId(),
      qty: (r[QTY_COL] ?? "").trim(),
      invoice_class: (r[INVOICE_CLASS_COL] ?? "").trim(),
      item: (r[ITEM_COL] ?? "").trim(),
      description: (r[DESC_COL] ?? "").trim(),
      rate: (r[RATE_COL] ?? "").trim(),
      amount: (r[AMOUNT_COL] ?? "").trim(),
      confidence: 1,
      class: (r[CLASS_COL] ?? "").trim(),
      original_description: (r[ORIGINAL_DESCRIPTION_COL] ?? "").trim(),
      problem: (r[PROBLEM_COL] ?? "").trim().toUpperCase() === "TRUE",
    }));

    const order: EditableOrder = {
      customer_written: customerName,
      customer_suggested: customerName,
      waitress: (first[WAITRESS_COL] ?? "").trim(),
      slip_type: (first[CLASS_COL] ?? "").trim(),
      member_status: memberStatus,
      order_slip_date: (first[DATE_COL] ?? "").trim(),
      order_slip_number: slipNumber,
      terms: (first[TERMS_COL] ?? "").trim(),
      memo: (first[MEMO_COL] ?? "").trim(),
      items,
      // Not persisted separately -- see EditableOrder's own comment.
      // Whatever caused this slip to show up in Review Problem Records
      // (a per-item Problem flag, or a prior Unsure press) already carries
      // over via each item's own `problem` field above.
      customer_unsure: false,
    };

    // Fed to VerificationForm as its `extraction` prop alongside `order` as
    // `initialOrder` -- initialOrder supplies the actual field values,
    // this just carries the match lists the form's dropdowns need
    // (customer_matches/waitress_matches are left empty: the name is
    // already known-correct, not something to re-suggest against).
    const extraction: OrderSlipExtraction = {
      customer_written: order.customer_written,
      customer_suggested: order.customer_suggested,
      waitress: order.waitress,
      slip_type: order.slip_type,
      member_status: order.member_status,
      order_slip_date: order.order_slip_date,
      order_slip_number: order.order_slip_number,
      terms: order.terms,
      memo: order.memo,
      items: [],
      overall_confidence: 1,
      uncertain_fields: [],
      customer_matches: [],
      customer_list: customerList,
      walkin_list: walkinList,
      waitress_matches: [],
      waitress_list: waitressList,
    };

    return NextResponse.json({ ok: true, order, extraction, itemTemplate, imageDataUrl });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
