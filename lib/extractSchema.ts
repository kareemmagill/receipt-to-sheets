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
      description: "The name written on the slip's own separate 'Waitress:' line -- often left blank in practice. Never part of customer_written. Empty string if blank/illegible.",
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
    uncertain_fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string", description: "The field path, e.g. 'order_slip_date' or 'items[1].amount'." },
          confidence: { type: "number", description: "0 to 1: your confidence in this specific field's reading." },
        },
        required: ["field", "confidence"],
        additionalProperties: false,
      },
      description:
        "Only fields you are not fully confident about, each paired with your confidence 0-1 for that specific field. Omit any field you're confident about entirely -- don't list every field.",
    },
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

export interface UncertainField {
  field: string;
  confidence: number; // 0 to 1
}

export interface OrderSlipItem {
  qty: string;
  invoice_class: string;
  item: string; // looked-up item code — filled in server-side, empty if unmatched
  description: string;
  rate: string; // derived server-side as amount / qty, never read off the slip
  amount: string;
  confidence: number;
  class: string; // "Restaurant" | "Bar" | "" — derived server-side per item
  // The model's raw reading, frozen at extraction time and never touched
  // again -- description above can get overwritten with a clean canonical
  // name when the reviewer picks a candidate chip (e.g. "extra rice" ->
  // "Rice"), which is good for the sheet's readability but would otherwise
  // erase the exact handwriting that needs remembering for next time. Kept
  // separately so lib/itemCorrections.ts can still learn "extra rice" ->
  // that item code even after description itself gets cleaned up (Kareem,
  // 2026-08-17). Empty for manually added items with no OCR behind them.
  original_description: string;
  // Best-guess Inventory matches for this line — filled in server-side, not
  // part of what the vision model returns.
  candidates?: { description: string; itemCode: string; score: number }[];
  // Set by the reviewer on the verification form when they couldn't
  // confidently make sense of this line (Kareem, 2026-08-20: "flag this
  // record for extra scrutiny because there was problem with understadning
  // item(s) on the form") -- never touches whether the order can still be
  // saved, just marks it for a second look later via the Review Problem
  // Records page (see lib/problemRecords.ts). Never set by the vision
  // model itself.
  problem?: boolean;
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
  uncertain_fields: UncertainField[];
  // Filled in server-side — not part of what the vision model returns.
  // Always both matched and sent, regardless of member_status, so the
  // verification form can react live if member_status gets corrected after
  // the fact instead of being stuck with whichever one was matched at
  // extraction time (a real bug found 2026-08-15: member names could keep
  // showing after correcting Member -> Non-Member, since only one side had
  // ever been fetched). customer_matches/customer_list is real Members
  // (the Customers tab); waitress_matches/waitress_list is unrelated to
  // this pair, see below.
  customer_matches?: { name: string; score: number }[];
  customer_list?: string[];
  // Past walk-in (Non-Member) names -- see lib/knownNames.ts. Never mixed
  // with customer_matches/customer_list above. No scored matches
  // alongside this one (unlike customer_matches/waitress_matches) -- a
  // walk-in isn't a fixed roster to fuzzy-match against up front; the
  // verification form filters this list live against whatever's actually
  // typed instead (Kareem, 2026-08-17).
  walkin_list?: string[];
  // Same self-correcting idea, for waitress_written against past waitress
  // names -- see lib/knownNames.ts.
  waitress_matches?: { name: string; score: number }[];
  waitress_list?: string[];
}
