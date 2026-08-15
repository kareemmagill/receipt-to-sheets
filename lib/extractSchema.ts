// Schema sent to the vision model. Fields the app computes itself
// (customer_suggested, item codes, per-item class, AR number, rate) are NOT
// part of this — the model only returns what it can actually read. Rate is
// not on this list: chits only ever have one number written after an item's
// description, and that's the line total (Amount), not a per-unit price —
// Rate is always derived as Amount / QTY (see app/api/extract/route.ts and
// components/VerificationForm.tsx), never read off the slip.
export const ORDER_SLIP_ITEM_SCHEMA = {
  type: "object",
  properties: {
    qty: { type: "string", description: "Quantity as written, e.g. '1' or '2'." },
    description: {
      type: "string",
      description: "The item/food/drink name exactly as handwritten, e.g. 'SMA', 'Heineken Green Can', 'Club Sandwich'. This identifies what was ordered.",
    },
    amount: { type: "string", description: "The line total written after the item description. Empty string if illegible or absent." },
    confidence: { type: "number", description: "0 to 1: how confident the reading of this line is." },
  },
  required: ["qty", "description", "amount", "confidence"],
  additionalProperties: false,
};

export const ORDER_SLIP_SCHEMA = {
  type: "object",
  properties: {
    customer_written: { type: "string", description: "Customer/member name exactly as handwritten. Empty string if unreadable." },
    waitress_written: {
      type: "string",
      description: "The waiter/waitress name, if written on the slip -- often a second handwritten line near the customer name. Never part of customer_written. Empty string if absent/illegible.",
    },
    slip_type: {
      type: "string",
      enum: ["", "Bar", "Restaurant"],
      description: "Which printed slip form this is, based on its heading. 'Order Slip' headed/marked BAR is 'Bar'. 'Food Order Slip' headed/marked Restaurant is 'Restaurant'. Empty string if the heading isn't legible.",
    },
    order_slip_date: { type: "string", description: "Date exactly as written. Empty string if absent." },
    order_slip_number: {
      type: "string",
      description: "The slip's own printed number, next to a label like 'NO' or 'NO.'. On a Bar Order Slip it's in the top-right corner; on a Food Order Slip (Restaurant) it's in the bottom-right corner. Do not confuse this with an AR number, table number, or phone number. Empty string if absent.",
    },
    terms: {
      type: "string",
      enum: ["", "COD", "CREDIT"],
      description: "COD or CREDIT based on what's marked/written on the slip. Empty string if genuinely undeterminable.",
    },
    member_status: {
      type: "string",
      enum: ["", "Member", "Non-Member"],
      description: "Whether the slip's Member / Non-Member checkbox or marking is set to Member or Non-Member. Empty string if there's no such marking or it's illegible.",
    },
    memo: { type: "string", description: "Any memo/note text on the slip. Empty string if absent." },
    items: { type: "array", items: ORDER_SLIP_ITEM_SCHEMA, description: "One entry per line item. Repeated identical items are separate lines unless clearly written as one combined quantity." },
    overall_confidence: { type: "number", description: "0 to 1: overall confidence in this extraction." },
    uncertain_fields: { type: "array", items: { type: "string" }, description: "Names of fields you are not confident about, e.g. 'order_slip_date', 'items[1].amount'." },
  },
  required: [
    "customer_written",
    "waitress_written",
    "slip_type",
    "order_slip_date",
    "order_slip_number",
    "terms",
    "member_status",
    "memo",
    "items",
    "overall_confidence",
    "uncertain_fields",
  ],
  additionalProperties: false,
};

export interface OrderSlipItem {
  qty: string;
  invoice_class: string;
  item: string; // looked-up item code — filled in server-side, empty if unmatched
  description: string;
  rate: string; // derived server-side as amount / qty, never read off the slip
  amount: string;
  confidence: number;
  class: string; // "Restaurant" | "Bar" | "" — derived server-side per item
  // Best-guess Inventory matches for this line — filled in server-side, not
  // part of what the vision model returns.
  candidates?: { description: string; itemCode: string; score: number }[];
}

export interface OrderSlipExtraction {
  customer_written: string;
  customer_suggested: string;
  waitress: string;
  slip_type: string; // "Bar" | "Restaurant" | "" — which physical slip form this is
  member_status: string; // "Member" | "Non-Member" | ""
  order_slip_date: string;
  order_slip_number: string;
  terms: string;
  memo: string;
  items: OrderSlipItem[];
  overall_confidence: number;
  uncertain_fields: string[];
  // Filled in server-side — not part of what the vision model returns.
  customer_matches?: { name: string; score: number }[];
  customer_list?: string[];
}
