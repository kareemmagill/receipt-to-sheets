import type { EditableOrder } from "@/components/VerificationForm";

export interface ExistingOrderItem {
  qty: string;
  description: string;
  item: string;
  amount: string;
}

export interface ExistingOrderSummary {
  // The app's identity key for update/delete/photo-lookup (see
  // lib/deleteOrderBySlip.ts) -- always populated here, since this summary
  // only ever exists as the result of a slip-number match. Works for
  // legacy rows that predate this app too, unlike AR number.
  slipNumber: string;
  // Informational only now -- shown in the duplicate message so a human
  // can cross-reference it, but blank for legacy rows that predate this
  // app's AR numbering and no longer anything callers key off of.
  arNumber: string;
  customer: string;
  date: string;
  items: ExistingOrderItem[];
  // ISO/UTC when the row was saved (see buildSalesOrderRows) -- empty for
  // legacy rows saved before this column existed (2026-08-17).
  enteredAt: string;
  // Filled in by /api/check-duplicate from the Photo Log tab -- the
  // save-time checkDuplicateSlip path below leaves this unset, since the
  // post-save screen already has its own photo link.
  photoLink?: string;
  // Embeddable version of photoLink (see lib/googleDrive.ts's
  // driveThumbnailUrl) -- absent if the photo predates that file's
  // link-sharing fix, in which case photoLink is still the fallback.
  photoThumbnailUrl?: string;
}

export interface DuplicateCheckResult {
  status: "none" | "exact" | "conflict";
  message?: string;
  differences?: string[];
  existing?: ExistingOrderSummary;
}

// Sales Orders columns: Name(0), Class(1), Order Slip Date(2), Order Slip
// Number(3), AR NO.(4), Terms(5), Memo(6), Class(7), QTY(8), Invoice
// Class(9), Item(10), Description(11), Rate(12), Amount(13), Waitress(14),
// Member Status(15), Entered At(16)
const NAME_COL = 0;
const CLASS_COL = 1;
const DATE_COL = 2;
const SLIP_NUM_COL = 3;
const AR_COL = 4;
const ITEM_COL = 10;
const DESC_COL = 11;
const QTY_COL = 8;
const RATE_COL = 12;
const AMOUNT_COL = 13;
const ENTERED_AT_COL = 16;

/**
 * Rows matching a given slip type + number. Bar and Food (Restaurant) order
 * slips are printed on separate pads, so the same number legitimately
 * exists once per type -- matching on number alone would wrongly flag two
 * different real chits as duplicates of each other (real gap found
 * 2026-08-17). Falls back to number-only when the type wasn't read, rather
 * than silently missing a real duplicate.
 */
function findExistingRows(slipType: string, slipNumber: string, rows: string[][]): string[][] {
  const type = slipType.trim();
  return rows
    .slice(1)
    .filter(
      (r) => (r[SLIP_NUM_COL] ?? "").trim() === slipNumber && (!type || (r[CLASS_COL] ?? "").trim() === type)
    );
}

/**
 * Looks up whether a slip type + number is already recorded, without
 * needing a full reviewed EditableOrder to compare against -- used right
 * after OCR extraction, before the reviewer has been through the
 * verification form (see /api/check-duplicate).
 */
export function findExistingOrderBySlip(
  slipType: string,
  slipNumber: string,
  rows: string[][]
): ExistingOrderSummary | null {
  const number = slipNumber.trim();
  if (!number) return null;

  const existingRows = findExistingRows(slipType, number, rows);
  if (existingRows.length === 0) return null;

  return {
    slipNumber: number,
    arNumber: (existingRows[0][AR_COL] ?? "").trim(),
    customer: (existingRows[0][NAME_COL] ?? "").trim(),
    date: (existingRows[0][DATE_COL] ?? "").trim(),
    enteredAt: (existingRows[0][ENTERED_AT_COL] ?? "").trim(),
    items: existingRows.map((r) => ({
      qty: (r[QTY_COL] ?? "").trim(),
      description: (r[DESC_COL] ?? "").trim(),
      item: (r[ITEM_COL] ?? "").trim(),
      amount: (r[AMOUNT_COL] ?? "").trim(),
    })),
  };
}

/**
 * A physical order slip number should never appear twice for the same slip
 * type. If it's already in the sheet with identical data, this is a
 * re-scan of the same slip — skip it silently. If it's already there with
 * *different* data, that's a real conflict worth a human's attention, not
 * something to guess about.
 *
 * Takes already-fetched Sales Orders rows rather than reading the tab
 * itself -- see lib/arNumber.ts's nextArNumberFromRows for why.
 */
export function checkDuplicateSlip(order: EditableOrder, rows: string[][]): DuplicateCheckResult {
  const slipNumber = order.order_slip_number.trim();
  if (!slipNumber) return { status: "none" };

  const existingRows = findExistingRows(order.slip_type, slipNumber, rows);
  if (existingRows.length === 0) return { status: "none" };

  const existing = findExistingOrderBySlip(order.slip_type, slipNumber, rows)!;

  const differences: string[] = [];

  const existingCustomer = (existingRows[0][NAME_COL] ?? "").trim();
  const newCustomer = (order.customer_suggested || order.customer_written).trim();
  if (existingCustomer !== newCustomer) {
    differences.push(`Customer: already "${existingCustomer}", new entry says "${newCustomer}"`);
  }

  const existingDate = (existingRows[0][DATE_COL] ?? "").trim();
  if (existingDate !== order.order_slip_date.trim()) {
    differences.push(`Date: already "${existingDate}", new entry says "${order.order_slip_date}"`);
  }

  if (existingRows.length !== order.items.length) {
    differences.push(`Item count: already ${existingRows.length} row(s), new entry has ${order.items.length}`);
  } else {
    existingRows.forEach((r, i) => {
      const newItem = order.items[i];
      const existingDesc = (r[DESC_COL] ?? "").trim();
      const existingQty = (r[QTY_COL] ?? "").trim();
      const existingRate = (r[RATE_COL] ?? "").trim();
      const existingAmount = (r[AMOUNT_COL] ?? "").trim();
      if (
        existingDesc !== newItem.description.trim() ||
        existingQty !== newItem.qty.trim() ||
        existingRate !== newItem.rate.trim() ||
        existingAmount !== newItem.amount.trim()
      ) {
        differences.push(
          `Item ${i + 1}: already "${existingDesc}" qty ${existingQty} rate ${existingRate} amt ${existingAmount}, new entry says "${newItem.description}" qty ${newItem.qty} rate ${newItem.rate} amt ${newItem.amount}`
        );
      }
    });
  }

  if (differences.length === 0) {
    return {
      status: "exact",
      message: `Slip #${slipNumber} is already recorded${existing.arNumber ? ` (as ${existing.arNumber})` : ""}.`,
      existing,
    };
  }

  return {
    status: "conflict",
    message: `Slip #${slipNumber} is already in the sheet, but with different data.`,
    differences,
    existing,
  };
}
