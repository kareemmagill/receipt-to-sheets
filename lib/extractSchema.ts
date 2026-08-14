// Schema sent to the vision model. Fields the app computes itself
// (customer_suggested, item codes, per-item class, AR number) are NOT
// part of this — the model only returns what it can actually read.
export const ORDER_SLIP_ITEM_SCHEMA = {
  type: "object",
  properties: {
    qty: { type: "string", description: "Quantity as written, e.g. '1' or '2'." },
    invoice_class: { type: "string", description: "Empty string if not present on the slip." },
    description: {
      type: "string",
      description: "The item/food/drink name exactly as handwritten, e.g. 'SMA', 'Heineken Green Can', 'Club Sandwich'. This identifies what was ordered.",
    },
    rate: { type: "string", description: "Unit price as written. Empty string if illegible or absent." },
    amount: { type: "string", description: "Line total as written. Empty string if illegible or absent." },
    confidence: { type: "number", description: "0 to 1: how confident the reading of this line is." },
  },
  required: ["qty", "invoice_class", "description", "rate", "amount", "confidence"],
  additionalProperties: false,
};

export const ORDER_SLIP_SCHEMA = {
  type: "object",
  properties: {
    customer_written: { type: "string", description: "Customer/member name exactly as handwritten. Empty string if unreadable." },
    order_slip_date: { type: "string", description: "Date exactly as written. Empty string if absent." },
    order_slip_number: {
      type: "string",
      description: "The slip's own number — usually printed in the top-right corner, following a label like 'NO' or 'NO.'. Do not confuse this with an AR number, table number, or phone number. Empty string if absent.",
    },
    terms: {
      type: "string",
      enum: ["", "COD", "CREDIT"],
      description: "COD or CREDIT based on what's marked/written on the slip. Empty string if genuinely undeterminable.",
    },
    memo: { type: "string", description: "Any memo/note text on the slip. Empty string if absent." },
    items: { type: "array", items: ORDER_SLIP_ITEM_SCHEMA, description: "One entry per line item. Repeated identical items are separate lines unless clearly written as one combined quantity." },
    overall_confidence: { type: "number", description: "0 to 1: overall confidence in this extraction." },
    uncertain_fields: { type: "array", items: { type: "string" }, description: "Names of fields you are not confident about, e.g. 'order_slip_date', 'items[1].rate'." },
  },
  required: [
    "customer_written",
    "order_slip_date",
    "order_slip_number",
    "terms",
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
  rate: string;
  amount: string;
  confidence: number;
  class: string; // "Restaurant" | "Bar" | "" — derived server-side per item
}

export interface OrderSlipExtraction {
  customer_written: string;
  customer_suggested: string;
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
