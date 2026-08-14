import type { EditableOrder } from "@/components/VerificationForm";

// Matches the real Sales Orders header row exactly (confirmed 2026-08-14):
// Name, Class, Order Slip Date, Order Slip Number, AR NO. , Terms, Memo,
// Class, QTY, Invoice Class, Item, Description, Rate, Amount — with the
// Class column appearing twice (B and H). Class is per-item (Restaurant or
// Bar, depending on the item), not per-order, so rows for the same order
// can carry different Class values.
export function buildSalesOrderRows(order: EditableOrder, arNumber: string): (string | number)[][] {
  const customerName = order.customer_suggested || order.customer_written;

  return order.items.map((item) => [
    customerName,
    item.class,
    order.order_slip_date,
    order.order_slip_number,
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
  ]);
}
