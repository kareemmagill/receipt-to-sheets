import type { EditableOrder } from "@/components/VerificationForm";
import { normalizeDate } from "./dateNormalize";
export { mostRecentOrderDate } from "./dateNormalize";

// Matches the real Sales Orders header row exactly: Name, Class, Order Slip
// Date, Order Slip Number, AR NO. , Terms, Memo, Class, QTY, Invoice Class,
// Item, Description, Rate, Amount, Waitress, Member Status, Entered At,
// Entered By, Device, Original Description, Problem (Waitress and Member
// Status added 2026-08-15 as the 15th/16th columns; Entered At/By/Device
// added 2026-08-17 as the 17th-19th; Original Description added 2026-08-17
// as the 20th; Problem added 2026-08-20 as the 21st -- each appended
// rather than inserted among the existing ones, so nothing that reads this
// sheet by position gets shifted) — with the
// Class column appearing twice (B and H). Class is per-item (Restaurant
// or Bar, depending on the item), not per-order, so rows for the same
// order can carry different Class values. Memo holds only the slip's own
// memo/note text now -- Waitress used to be folded into it (no column of
// its own existed yet) but that's no longer needed. Original Description
// is the model's raw, never-edited reading of that line -- kept separate
// from Description (which can get cleaned up to a canonical name when the
// reviewer picks a candidate chip) purely so lib/itemCorrections.ts can
// keep matching the exact handwriting it originally saw, even after the
// visible Description no longer says that (Kareem, 2026-08-17: "extra
// rice" -> Rice should still auto-match "extra rice" next time). Problem
// is the reviewer's own "still needs a closer look" flag -- written TRUE
// on a row if either that specific item's Problem button was pressed, or
// the whole order's Unsure button (next to Customer / Name) was, since
// there's no separate column for the latter (Kareem, 2026-08-20: "add
// this record to the problem records to be reviewed later" -- Unsure is
// order-level, Problem is per-item, but they land in the same column and
// the same Review Problem Records list). "TRUE" or blank, read back by
// lib/problemRecords.ts. Re-saving with every flag cleared is how a
// flagged record gets resolved (Kareem, 2026-08-20: "the user can edit
// and approve the slip") -- there's no separate approve action, editing
// and saving with every flag off already writes a clean row.
// A leading apostrophe tells Sheets' USER_ENTERED parser to store the value
// as literal text instead of auto-parsing it — without this, a date-looking
// string like "8/27/25" gets converted into a date serial number, which
// then displays as a raw number (e.g. "46248") whenever the cell doesn't
// happen to inherit a date number format. The apostrophe itself never shows
// up in the stored/displayed value.
function asLiteralText(value: string): string {
  return `'${value}`;
}

export function buildSalesOrderRows(
  order: EditableOrder,
  arNumber: string,
  referenceDate: Date | null,
  enteredBy = "",
  device = ""
): (string | number)[][] {
  const customerName = order.customer_suggested || order.customer_written;
  // One timestamp per order (not re-computed per item row), same as
  // arNumber -- when the save actually happened, not when each individual
  // line got built. ISO/UTC, same convention as Photo Log's "Saved At"
  // column -- callers format it for display in the viewer's local time
  // (see formatEnteredAt in app/page.tsx).
  const enteredAt = new Date().toISOString();

  return order.items.map((item) => [
    customerName,
    item.class,
    asLiteralText(normalizeDate(order.order_slip_date, referenceDate)),
    asLiteralText(order.order_slip_number),
    arNumber,
    order.terms,
    order.memo,
    item.class,
    item.qty,
    item.invoice_class,
    item.item,
    item.description,
    item.rate,
    item.amount,
    order.waitress,
    order.member_status,
    enteredAt,
    enteredBy,
    device,
    item.original_description,
    item.problem || order.customer_unsure ? "TRUE" : "",
  ]);
}
