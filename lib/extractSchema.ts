export const ORDER_SLIP_ITEM_SCHEMA = {
  type: "object",
  properties: {
    qty: { type: "string", description: "Quantity as written, e.g. '1' or '2'." },
    invoice_class: { type: "string", description: "Empty string if not present on the slip." },
    item: { type: "string", description: "Item code/name exactly as handwritten, e.g. 'SMA' or 'Heineken Green Can'." },
    description: { type: "string", description: "Empty string if no separate description is written." },
    rate: { type: "string", description: "Unit price as written. Empty string if illegible or absent." },
    amount: { type: "string", description: "Line total as written. Empty string if illegible or absent." },
    confidence: { type: "number", description: "0 to 1: how confident the reading of this line is." },
  },
  required: ["qty", "invoice_class", "item", "description", "rate", "amount", "confidence"],
  additionalProperties: false,
};

export const ORDER_SLIP_SCHEMA = {
  type: "object",
  properties: {
    customer_written: { type: "string", description: "Customer/member name exactly as handwritten. Empty string if unreadable." },
    customer_suggested: { type: "string", description: "Leave as an empty string always — the app fills this in via fuzzy matching, not the vision model." },
    order_slip_date: { type: "string", description: "Date exactly as written. Empty string if absent." },
    order_slip_number: { type: "string", description: "Order slip number exactly as written. Empty string if absent." },
    ar_number: { type: "string", description: "AR number exactly as written. Empty string if absent." },
    terms: { type: "string", description: "Payment terms if written (e.g. COD). Empty string if absent." },
    memo: { type: "string", description: "Any memo/note text on the slip. Empty string if absent." },
    class: { type: "string", description: "Class if written or clearly implied by the venue/section on the slip. Empty string if absent." },
    items: { type: "array", items: ORDER_SLIP_ITEM_SCHEMA, description: "One entry per line item. Repeated identical items are separate lines unless clearly written as one combined quantity." },
    overall_confidence: { type: "number", description: "0 to 1: overall confidence in this extraction." },
    uncertain_fields: { type: "array", items: { type: "string" }, description: "Names of fields you are not confident about, e.g. 'order_slip_date', 'items[1].rate'." },
  },
  required: [
    "customer_written",
    "customer_suggested",
    "order_slip_date",
    "order_slip_number",
    "ar_number",
    "terms",
    "memo",
    "class",
    "items",
    "overall_confidence",
    "uncertain_fields",
  ],
  additionalProperties: false,
};

export interface OrderSlipItem {
  qty: string;
  invoice_class: string;
  item: string;
  description: string;
  rate: string;
  amount: string;
  confidence: number;
}

export interface OrderSlipExtraction {
  customer_written: string;
  customer_suggested: string;
  order_slip_date: string;
  order_slip_number: string;
  ar_number: string;
  terms: string;
  memo: string;
  class: string;
  items: OrderSlipItem[];
  overall_confidence: number;
  uncertain_fields: string[];
}
