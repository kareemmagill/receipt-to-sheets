import type { ExistingOrderSummary } from "@/lib/duplicateCheck";
import { SlipLayout } from "@/components/SlipLayout";

// Thin wrapper turning an already-recorded order into the physical-slip
// layout -- shared by the Duplicate Slip screen, the Confirmation screen's
// "already recorded" path, and the Daily Report page's slip-click viewer
// (Kareem, 2026-08-18: "open the saved image AND the digitised version,
// same layout as on duplicate slips").
export function ExistingOrderRecap({ order }: { order: ExistingOrderSummary }) {
  const total = order.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  return (
    <SlipLayout
      slipNumber={order.slipNumber}
      slipType={order.slipType}
      customer={order.customer}
      waitress={order.waitress}
      date={order.date}
      memberStatus={order.memberStatus}
      items={order.items.map((item) => ({
        qty: item.qty,
        description: item.description,
        itemCode: item.item,
        amount: item.amount,
        problem: item.problem,
      }))}
      total={total}
      terms={order.terms}
      problemFlag={order.items.some((item) => item.problem)}
    />
  );
}
