import type { EditableOrder } from "@/components/VerificationForm";

// Matches the real Sales Orders header row exactly (confirmed 2026-08-14):
// Name, Class, Order Slip Date, Order Slip Number, AR NO. , Terms, Memo,
// Class, QTY, Invoice Class, Item, Description, Rate, Amount — with the
// Class column appearing twice (B and H). Class is per-item (Restaurant or
// Bar, depending on the item), not per-order, so rows for the same order
// can carry different Class values.
// A leading apostrophe tells Sheets' USER_ENTERED parser to store the value
// as literal text instead of auto-parsing it — without this, a date-looking
// string like "8/27/25" gets converted into a date serial number, which
// then displays as a raw number (e.g. "46248") whenever the cell doesn't
// happen to inherit a date number format. The apostrophe itself never shows
// up in the stored/displayed value.
function asLiteralText(value: string): string {
  return `'${value}`;
}

export function buildSalesOrderRows(order: EditableOrder, arNumber: string): (string | number)[][] {
  const customerName = order.customer_suggested || order.customer_written;
  // Waitress has no sheet column of its own -- folded into Memo here, right
  // at the point of writing, rather than earlier in extraction/editing where
  // it's kept as its own field (see app/api/extract/route.ts).
  const memo = order.waitress ? [`Waitress: ${order.waitress}`, order.memo].filter(Boolean).join("; ") : order.memo;

  return order.items.map((item) => [
    customerName,
    item.class,
    asLiteralText(order.order_slip_date),
    asLiteralText(order.order_slip_number),
    arNumber,
    order.terms,
    memo,
    item.class,
    item.qty,
    item.invoice_class,
    item.item,
    item.description,
    item.rate,
    item.amount,
  ]);
}
