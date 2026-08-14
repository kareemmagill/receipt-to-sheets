import type { EditableOrder } from "@/components/VerificationForm";

// Matches the real Sales Orders header row exactly (confirmed 2026-08-14):
// Name, Class, Order Slip Date, Order Slip Number, AR NO. , Terms, Memo,
// Class, QTY, Invoice Class, Item, Description, Rate, Amount — with the
// Class column appearing twice (B and H), both holding the same value.
export function buildSalesOrderRows(order: EditableOrder): (string | number)[][] {
  const customerName = order.customer_suggested || order.customer_written;

  return order.items.map((item) => [
    customerName,
    order.class,
    order.order_slip_date,
    order.order_slip_number,
    order.ar_number,
    order.terms,
    order.memo,
    order.class,
    item.qty,
    item.invoice_class,
    item.item,
    item.description,
    item.rate,
    item.amount,
  ]);
}
