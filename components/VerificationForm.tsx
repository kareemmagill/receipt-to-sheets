"use client";

import { useState } from "react";
import type { OrderSlipExtraction, OrderSlipItem, UncertainField } from "@/lib/extractSchema";
import { makeId } from "@/lib/makeId";
import { matchItemCodeCandidates, ITEM_MATCH_CONFIDENT_THRESHOLD, type ItemCodeEntry } from "@/lib/itemCodeScoring";
import { normalizeDate } from "@/lib/dateNormalize";
import { Spinner } from "@/components/Spinner";

export type EditableItem = OrderSlipItem & { id: string };
export type EditableOrder = Omit<OrderSlipExtraction, "items" | "uncertain_fields" | "overall_confidence"> & {
  items: EditableItem[];
};

const MANUAL_CUSTOMER = "__MANUAL__";
const MANUAL_WAITRESS = "__MANUAL__";
const SLIP_TYPE_TOGGLE_OPTIONS = [
  { value: "Bar", display: "Order Slip (Bar)" },
  { value: "Restaurant", display: "Food Order Slip" },
];
const MEMBER_TOGGLE_OPTIONS = [
  { value: "Member", display: "Member" },
  { value: "Non-Member", display: "Non-Member" },
];
const PAID_TOGGLE_OPTIONS = [
  { value: "COD", display: "Paid" },
  { value: "CREDIT", display: "Not Paid" },
];

// Three-way confidence indicator shown on every field (Kareem, 2026-08-17):
// green when certain, yellow/amber when unsure, red at 25% confidence or
// below. A field the model never flagged in uncertain_fields is treated as
// fully confident (1.0) -- the model is instructed to only list fields
// it's NOT sure about, so silence means certain.
export type ConfidenceTier = "certain" | "unsure" | "low";

function tierFromConfidence(confidence: number): ConfidenceTier {
  if (confidence <= 0.25) return "low";
  if (confidence < 0.75) return "unsure";
  return "certain";
}

interface FieldConfidences {
  top: Map<string, number>;
  items: Map<number, Map<string, number>>;
}

function parseUncertainFields(raw: UncertainField[]): FieldConfidences {
  const top = new Map<string, number>();
  const items = new Map<number, Map<string, number>>();
  for (const entry of raw) {
    const itemMatch = entry.field.match(/^items\[(\d+)]\.(\w+)$/);
    if (itemMatch) {
      const index = Number(itemMatch[1]);
      if (!items.has(index)) items.set(index, new Map());
      items.get(index)!.set(itemMatch[2], entry.confidence);
    } else {
      top.set(entry.field, entry.confidence);
    }
  }
  return { top, items };
}

function topTier(confidences: FieldConfidences, field: string): ConfidenceTier {
  return tierFromConfidence(confidences.top.has(field) ? confidences.top.get(field)! : 1);
}

// Item sub-fields fall back to the line's own overall confidence (already
// scored by the model for every item) rather than assuming full certainty,
// when the model hasn't specifically flagged that sub-field on its own.
function itemFieldTier(confidences: FieldConfidences, index: number, field: string, lineConfidence: number): ConfidenceTier {
  const map = confidences.items.get(index);
  const confidence = map?.has(field) ? map.get(field)! : lineConfidence;
  return tierFromConfidence(confidence);
}

// Description gets a stricter rule than the general 0.75 cutoff (Kareem,
// 2026-08-17): anything short of exactly 100% shows yellow, since the item
// alternatives list only exists for description misreads and should be
// reachable whenever there's any doubt at all, not just below 75%.
function itemDescriptionTier(confidences: FieldConfidences, index: number, lineConfidence: number): ConfidenceTier {
  const map = confidences.items.get(index);
  const confidence = map?.has("description") ? map.get("description")! : lineConfidence;
  if (confidence <= 0.25) return "low";
  if (confidence >= 0.999) return "certain";
  return "unsure";
}

const TIER_SEVERITY: Record<ConfidenceTier, number> = { certain: 0, unsure: 1, low: 2 };
function worstTier(...tiers: ConfidenceTier[]): ConfidenceTier {
  return tiers.reduce((worst, t) => (TIER_SEVERITY[t] > TIER_SEVERITY[worst] ? t : worst), "certain" as ConfidenceTier);
}

function toEditable(extraction: OrderSlipExtraction): EditableOrder {
  return {
    customer_written: extraction.customer_written,
    customer_suggested: extraction.customer_suggested,
    waitress: extraction.waitress,
    slip_type: extraction.slip_type,
    member_status: extraction.member_status,
    // Normalized for display too, not just at save time (lib/salesOrderRows.ts)
    // -- otherwise what's shown on the review screen wouldn't match what
    // actually gets written, which is exactly the kind of mismatch someone
    // would (rightly) call a bug. No reference date here since there's no
    // sheet data on hand client-side; the real reference-date
    // disambiguation for genuinely ambiguous dates happens again at save
    // time, so a rare edge case could still re-resolve differently there.
    order_slip_date: normalizeDate(extraction.order_slip_date, null),
    order_slip_number: extraction.order_slip_number,
    terms: extraction.terms,
    memo: extraction.memo,
    items: extraction.items.map((item) => ({ ...item, id: makeId() })),
  };
}

// A walk-in must always pay on the spot -- never allowed to be marked Not
// Paid (Kareem, 2026-08-17). Applied on load too, not just on later toggle
// clicks, in case a misread slip came back Non-Member + Not Paid already.
function enforcePaymentRule(order: EditableOrder): EditableOrder {
  if (order.member_status === "Non-Member" && order.terms === "CREDIT") {
    return { ...order, terms: "COD" };
  }
  return order;
}

function parseNumeric(s: string): number | null {
  const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function emptyItem(): EditableItem {
  return {
    id: makeId(),
    qty: "",
    invoice_class: "",
    item: "",
    description: "",
    rate: "",
    amount: "",
    confidence: 1,
    class: "",
  };
}

export default function VerificationForm({
  extraction,
  itemTemplate,
  initialOrder,
  photoDataUrl,
  onConfirm,
  onRetake,
  onRetakeLabel = "Retake Photo",
  confirmLabel = "Confirm & Save",
  saving = false,
}: {
  extraction: OrderSlipExtraction;
  itemTemplate: ItemCodeEntry[];
  // Overrides toEditable(extraction) as the starting field values -- used
  // to re-open the form pre-filled with an order that was already edited
  // and saved (see the post-save "Edit" flow in app/page.tsx), rather than
  // reverting to the original, possibly-since-corrected vision extraction.
  // extraction is still used for its customer_matches/customer_list and
  // uncertain_fields highlighting either way.
  initialOrder?: EditableOrder;
  // The full-resolution original photo, still held in memory client-side --
  // lets "View Full Photo" show it without a round-trip to Drive. Optional
  // so nothing breaks if a caller has no photo on hand.
  photoDataUrl?: string;
  onConfirm: (order: EditableOrder) => void;
  onRetake: () => void;
  onRetakeLabel?: string;
  confirmLabel?: string;
  saving?: boolean;
}) {
  const [order, setOrder] = useState<EditableOrder>(() => enforcePaymentRule(initialOrder ?? toEditable(extraction)));
  const [showPhoto, setShowPhoto] = useState(false);
  // Per-item review gate (Kareem, 2026-08-17) -- a person has to explicitly
  // approve every line before Confirm & Save is enabled. Deliberately not
  // part of EditableItem/the saved order: this is a review-workflow flag,
  // not data that belongs in the sheet.
  const [approvedItems, setApprovedItems] = useState<Set<string>>(new Set());
  // Which items currently have their alternative-description suggestions
  // panel open -- click-to-reveal (Kareem, 2026-08-17), replacing the old
  // always-visible-when-uncertain chips.
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(new Set());
  // Items where the reviewer manually resolved a no-inventory-match state
  // (picked a suggestion, or typed a code by hand) -- these show amber
  // rather than snapping straight to green, since a human override still
  // deserves a second look rather than reading as fully machine-confident
  // (Kareem, 2026-08-17).
  const [resolvedItems, setResolvedItems] = useState<Set<string>>(new Set());
  // Only used for the Member branch of the Customer field (a select/manual
  // toggle, same as before). Non-Member is always free text -- see the
  // render below for why (a real bug, fixed 2026-08-15: it isn't a fixed
  // roster like Members, so a dropdown-first UI blocked easy correction,
  // and it must never show a real member's name as a "suggestion").
  const [customerMode, setCustomerMode] = useState<"select" | "manual">(
    order.customer_suggested ? "select" : order.customer_written ? "select" : "manual"
  );
  const [customerError, setCustomerError] = useState<string | null>(null);
  // "select" only when the read name is already a known waitress -- unlike
  // customer_suggested (only ever a confident match or empty, by
  // construction of the extract API), extraction.waitress can legitimately
  // hold a legible-but-unmatched raw name (e.g. "Tracee" the first time
  // she's ever scanned). Gating on truthiness alone (the old check) meant
  // the <select> tried to show a value with no matching <option>, which
  // HTML silently renders as its first option ("— None —") -- looking
  // exactly like the name wasn't read at all, even though it was (real bug,
  // found 2026-08-17). "manual" shows it as editable free text instead,
  // same as a first-time customer name.
  const [waitressMode, setWaitressMode] = useState<"select" | "manual">(
    order.waitress && (extraction.waitress_list ?? []).includes(order.waitress) ? "select" : "manual"
  );

  const confidences = parseUncertainFields(extraction.uncertain_fields);
  const customerTier = topTier(confidences, "customer_written");
  // "waitress" and "waitress_written" are the same field under two names
  // across the extraction/uncertain_fields boundary -- worst of the two
  // wins, so a flag under either name shows. But that's only the model's
  // own confidence in its handwriting *reading*, which can stay middling
  // even when the name it read is a known one -- e.g. "Tracee" scored a
  // fuzzy 100% list match yet still showed yellow (real bug, chit #34899,
  // 2026-08-17). An exact match against a real known waitress overrides
  // that up to certain: the name is confirmed correct regardless of how
  // hesitant the model was about the handwriting itself.
  const waitressExactMatch = (extraction.waitress_matches ?? []).some(
    (m) => m.name === order.waitress && m.score >= 0.999
  );
  const waitressTier = waitressExactMatch
    ? "certain"
    : worstTier(topTier(confidences, "waitress"), topTier(confidences, "waitress_written"));

  const total = order.items.reduce((sum, item) => sum + (parseNumeric(item.amount) ?? 0), 0);
  // .every() on an empty array is true -- fine here, there's nothing to
  // approve if every item was removed, though the items-required check
  // elsewhere still blocks a zero-item save.
  const allItemsApproved = order.items.every((item) => approvedItems.has(item.id));

  const likelyMatches = (extraction.customer_matches ?? []).filter((m) => m.score >= 0.3);
  const likelyNames = new Set(likelyMatches.map((m) => m.name));
  const otherCustomers = (extraction.customer_list ?? [])
    .filter((name) => !likelyNames.has(name))
    .sort((a, b) => a.localeCompare(b));

  // Walk-in suggestions -- always sourced from past walk-ins only, never
  // the Customers/Members list, and read live off order.member_status so
  // correcting the toggle after the fact immediately drops any stale
  // member-sourced suggestions.
  const likelyWalkIns = (extraction.walkin_matches ?? []).filter((m) => m.score >= 0.3);
  const likelyWalkInNames = new Set(likelyWalkIns.map((m) => m.name));
  const otherWalkIns = (extraction.walkin_list ?? [])
    .filter((name) => !likelyWalkInNames.has(name))
    .sort((a, b) => a.localeCompare(b));

  // Kareem (2026-08-15): there are few enough waitresses that the whole
  // known list is worth showing, not just close matches.
  const likelyWaitresses = (extraction.waitress_matches ?? []).filter((m) => m.score >= 0.3);
  const likelyWaitressNames = new Set(likelyWaitresses.map((m) => m.name));
  const otherWaitresses = (extraction.waitress_list ?? [])
    .filter((name) => !likelyWaitressNames.has(name))
    .sort((a, b) => a.localeCompare(b));

  function updateField<K extends keyof EditableOrder>(field: K, value: EditableOrder[K]) {
    setOrder((prev) => ({ ...prev, [field]: value }));
  }

  function updateItem(id: string, field: keyof OrderSlipItem, value: string) {
    setOrder((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        // Rate is never written on a chit — it's always Amount / QTY,
        // recomputed here and shown read-only (see the Rate Field below).
        if (field === "qty" || field === "amount") {
          const qty = parseNumeric(updated.qty);
          const amount = parseNumeric(updated.amount);
          updated.rate = qty !== null && qty !== 0 && amount !== null ? formatAmount(amount / qty) : "";
        }
        // Invoice Class always mirrors Class.
        if (field === "class") {
          updated.invoice_class = value;
        }
        // Re-match item code candidates against the Inventory template as
        // the description is retyped, same threshold/logic as the initial
        // server-side match in app/api/extract/route.ts.
        if (field === "description") {
          const candidates = matchItemCodeCandidates(value, itemTemplate, 5);
          updated.candidates = candidates.map((c) => ({
            description: c.entry.salesDesc,
            itemCode: c.entry.itemCode,
            score: c.score,
          }));
          // Only a fully confident match auto-fills -- see the matching
          // threshold comment in app/api/extract/route.ts.
          updated.item =
            candidates[0] && candidates[0].score >= ITEM_MATCH_CONFIDENT_THRESHOLD ? candidates[0].entry.itemCode : "";
        }
        return updated;
      }),
    }));
  }

  function applyItemCandidate(id: string, candidate: { description: string; itemCode: string }) {
    setOrder((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, description: candidate.description, item: candidate.itemCode } : item
      ),
    }));
    setResolvedItems((prev) => new Set(prev).add(id));
  }

  function deleteItem(id: string) {
    if (!confirm("Sure to remove item?")) return;
    setOrder((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }));
    setApprovedItems((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setExpandedSuggestions((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setResolvedItems((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function addItem() {
    setOrder((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  }

  function toggleApproveItem(id: string) {
    setApprovedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSuggestions(id: string) {
    setExpandedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCustomerSelectChange(value: string) {
    if (value === MANUAL_CUSTOMER) {
      setCustomerMode("manual");
      updateField("customer_suggested", "");
    } else {
      updateField("customer_suggested", value);
    }
    setCustomerError(null);
  }

  function handleWaitressSelectChange(value: string) {
    if (value === MANUAL_WAITRESS) {
      setWaitressMode("manual");
      updateField("waitress", "");
    } else {
      updateField("waitress", value);
    }
  }

  function handleConfirmClick() {
    if (!order.customer_suggested.trim()) {
      setCustomerError("Select or enter a customer before saving.");
      return;
    }
    if (!allItemsApproved) return; // button is disabled in this state; belt and suspenders
    setCustomerError(null);
    onConfirm(order);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {photoDataUrl && (
        <button type="button" onClick={() => setShowPhoto(true)} style={secondaryButtonStyle}>
          View Full Photo
        </button>
      )}

      {showPhoto && photoDataUrl && (
        <div
          onClick={() => setShowPhoto(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoDataUrl}
            alt="Full order slip"
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <SlipTypeToggle
            value={order.slip_type}
            options={SLIP_TYPE_TOGGLE_OPTIONS}
            onChange={(v) => updateField("slip_type", v)}
            tier={topTier(confidences, "slip_type")}
          />

          <Field
            label="Slip Number"
            value={order.order_slip_number}
            onChange={(v) => updateField("order_slip_number", v)}
            tier={topTier(confidences, "order_slip_number")}
            bold
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...fieldLabelStyle, color: tierColor[customerTier] }}>Customer / Name</span>

          {order.member_status === "Non-Member" ? (
            // Always free text -- a walk-in isn't a fixed roster the way
            // Members are, so gating behind a dropdown just blocks quick
            // correction of a misread name. Past walk-in names (never real
            // members) are offered as chips underneath instead of a
            // required selection.
            <input
              value={order.customer_suggested}
              onChange={(e) => {
                updateField("customer_suggested", e.target.value);
                setCustomerError(null);
              }}
              placeholder="Type walk-in guest's name"
              style={{ ...inputStyle, ...tierInputStyle(customerTier) }}
            />
          ) : customerMode === "select" ? (
            <select
              value={order.customer_suggested}
              onChange={(e) => handleCustomerSelectChange(e.target.value)}
              style={{ ...selectStyle, ...tierInputStyle(customerTier) }}
            >
              <option value="" disabled>
                — Select customer —
              </option>
              {likelyMatches.length > 0 && (
                <optgroup label="Likely matches">
                  {likelyMatches.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({Math.round(m.score * 100)}%)
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All customers">
                {otherCustomers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
              <option value={MANUAL_CUSTOMER}>Other / new customer…</option>
            </select>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={order.customer_suggested}
                onChange={(e) => {
                  updateField("customer_suggested", e.target.value);
                  setCustomerError(null);
                }}
                placeholder="Type customer name"
                style={{ ...inputStyle, ...tierInputStyle(customerTier) }}
              />
              <button
                type="button"
                onClick={() => {
                  setCustomerMode("select");
                  updateField("customer_suggested", "");
                }}
                style={secondaryButtonStyle}
              >
                Back to list
              </button>
            </div>
          )}

          {order.member_status === "Non-Member" && (likelyWalkIns.length > 0 || otherWalkIns.length > 0) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[...likelyWalkIns.map((m) => m.name), ...otherWalkIns].slice(0, 8).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    updateField("customer_suggested", name);
                    setCustomerError(null);
                  }}
                  style={chipButtonStyle}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {order.customer_written && order.customer_written !== order.customer_suggested && (
            <span style={{ fontSize: 12, color: "#777" }}>Handwriting read as: &ldquo;{order.customer_written}&rdquo;</span>
          )}
          {customerError && <span style={{ fontSize: 12, color: "#b00020" }}>{customerError}</span>}
        </div>

        <ToggleField
          label="Member Status"
          value={order.member_status}
          options={MEMBER_TOGGLE_OPTIONS}
          onChange={(v) => {
            updateField("member_status", v);
            // A walk-in must always pay on the spot -- never allowed to be
            // marked Not Paid (Kareem, 2026-08-17).
            if (v === "Non-Member" && order.terms === "CREDIT") {
              updateField("terms", "COD");
            }
          }}
          tier={topTier(confidences, "member_status")}
        />

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ ...fieldLabelStyle, color: tierColor[waitressTier] }}>Waitress</span>

            {waitressMode === "select" ? (
              <select
                value={order.waitress}
                onChange={(e) => handleWaitressSelectChange(e.target.value)}
                style={{ ...selectStyle, ...tierInputStyle(waitressTier) }}
              >
                <option value="">— None —</option>
                {likelyWaitresses.length > 0 && (
                  <optgroup label="Likely matches">
                    {likelyWaitresses.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="All known waitresses">
                  {otherWaitresses.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
                <option value={MANUAL_WAITRESS}>Other / new name…</option>
              </select>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={order.waitress}
                  onChange={(e) => updateField("waitress", e.target.value)}
                  placeholder="Type waitress name"
                  style={{ ...inputStyle, ...tierInputStyle(waitressTier) }}
                />
                {(likelyWaitresses.length > 0 || otherWaitresses.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setWaitressMode("select");
                      updateField("waitress", "");
                    }}
                    style={secondaryButtonStyle}
                  >
                    Back to list
                  </button>
                )}
              </div>
            )}
          </div>

          <Field
            label="Date"
            type="date"
            value={order.order_slip_date}
            onChange={(v) => updateField("order_slip_date", v)}
            tier={topTier(confidences, "order_slip_date")}
          />
        </div>

        {order.memo && (
          <Field
            label="Memo"
            value={order.memo}
            onChange={(v) => updateField("memo", v)}
            tier={topTier(confidences, "memo")}
          />
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16 }}>Items</h2>
        {order.items.map((item, index) => {
          const approved = approvedItems.has(item.id);
          // No item code means the OCR description didn't confidently match
          // anything in Inventory -- this always wins over both the
          // manually-resolved flag (a stale resolution from a description
          // that's since been re-edited back into no-match) and the normal
          // reading-confidence tiers, since it's a distinct problem (not in
          // Inventory) from how legible the handwriting was (Kareem,
          // 2026-08-17).
          const noItemCodeMatch = !item.item;
          const manuallyResolved = resolvedItems.has(item.id);
          const descTier = noItemCodeMatch
            ? "low"
            : manuallyResolved
              ? "unsure"
              : itemDescriptionTier(confidences, index, item.confidence);
          const itemCodeTier = noItemCodeMatch ? "low" : manuallyResolved ? "unsure" : "certain";

          // While there's no match at all, every candidate Inventory might
          // have is shown up front (not click-to-reveal) -- there's nothing
          // to click into first, the reviewer needs to see the options
          // immediately to resolve the red state.
          const noMatchCandidates = item.candidates ?? [];
          const showNoMatchPicker = noItemCodeMatch && noMatchCandidates.length > 0;

          // Once there IS a code, the click-to-reveal alternates list still
          // applies if the description reading itself is less than fully
          // confident.
          const suggestions = (item.candidates ?? []).filter(
            (c) => c.score >= 0.3 && c.description !== item.description
          );
          const suggestionsAvailable = !noItemCodeMatch && descTier !== "certain" && suggestions.length > 0;
          const suggestionsOpen = suggestionsAvailable && expandedSuggestions.has(item.id);
          return (
            <div
              key={item.id}
              style={{
                border: `1px solid ${approved ? "#2e7d32" : "#ccc"}`,
                borderRadius: 8,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ width: 52 }}>
                  <Field
                    label="QTY"
                    value={item.qty}
                    onChange={(v) => updateItem(item.id, "qty", v)}
                    tier={itemFieldTier(confidences, index, "qty", item.confidence)}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <Field
                    label="Description"
                    value={item.description}
                    onChange={(v) => updateItem(item.id, "description", v)}
                    tier={descTier}
                  />
                </div>
                <div style={{ width: 76 }}>
                  <Field
                    label="Amount"
                    value={item.amount}
                    onChange={(v) => updateItem(item.id, "amount", v)}
                    tier={itemFieldTier(confidences, index, "amount", item.confidence)}
                  />
                </div>
              </div>

              {showNoMatchPicker && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: tierColor.low }}>No inventory match — choose the correct item:</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {noMatchCandidates.map((c) => (
                      <button
                        key={c.itemCode}
                        type="button"
                        onClick={() => applyItemCandidate(item.id, c)}
                        style={chipButtonStyle}
                      >
                        {c.description} ({Math.round(c.score * 100)}%)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {suggestionsAvailable && (
                <button type="button" onClick={() => toggleSuggestions(item.id)} style={suggestionsToggleStyle}>
                  {suggestionsOpen ? "Hide suggestions ▲" : `Suggestions (${suggestions.length}) ▾`}
                </button>
              )}

              {suggestionsOpen && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {suggestions.slice(0, 4).map((c) => (
                    <button
                      key={c.itemCode}
                      type="button"
                      onClick={() => {
                        applyItemCandidate(item.id, c);
                        toggleSuggestions(item.id);
                      }}
                      style={chipButtonStyle}
                    >
                      {c.description} ({Math.round(c.score * 100)}%)
                    </button>
                  ))}
                  <button type="button" onClick={() => toggleSuggestions(item.id)} style={chipButtonStyle}>
                    Input
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ width: 76 }}>
                  <Field label="Rate" value={item.rate} onChange={() => {}} readOnly />
                </div>
                <div style={{ width: 90 }}>
                  <Field
                    label="Item Code"
                    value={item.item}
                    onChange={(v) => {
                      // Typing a code by hand while there was no match is
                      // the same kind of manual resolution as picking a
                      // suggestion chip -- marks it resolved so it goes to
                      // amber rather than snapping straight to green.
                      if (noItemCodeMatch && v.trim()) {
                        setResolvedItems((prev) => new Set(prev).add(item.id));
                      }
                      updateItem(item.id, "item", v);
                    }}
                    tier={itemCodeTier}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => deleteItem(item.id)} style={removeButtonStyle}>
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => toggleApproveItem(item.id)}
                  style={approved ? approveButtonApprovedStyle : approveButtonPendingStyle}
                >
                  {approved ? "✓ Approved" : "Approve"}
                </button>
              </div>
            </div>
          );
        })}
        <button onClick={addItem} style={secondaryButtonStyle}>
          + Add Item
        </button>

        <div style={totalRowStyle}>
          <span>Total</span>
          <span>{formatAmount(total)}</span>
        </div>
      </div>

      <ToggleField
        label="Payment"
        value={order.terms}
        options={PAID_TOGGLE_OPTIONS}
        onChange={(v) => updateField("terms", v)}
        tier={topTier(confidences, "terms")}
        disabledOptionValues={order.member_status === "Non-Member" ? ["CREDIT"] : []}
      />

      {!allItemsApproved && (
        <p style={{ fontSize: 12, color: "#b8860b", margin: 0 }}>Approve every item above before saving.</p>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={onRetake} disabled={saving} style={secondaryButtonStyle}>
          {onRetakeLabel}
        </button>
        <button
          onClick={handleConfirmClick}
          disabled={saving || !allItemsApproved}
          style={{ ...primaryButtonStyle, flex: 1, ...(!allItemsApproved ? disabledButtonStyle : null) }}
        >
          {saving && <Spinner />}
          {saving ? "Saving…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

function ToggleField({
  label,
  value,
  options,
  onChange,
  tier = "certain",
  disabledOptionValues = [],
}: {
  label: string;
  value: string;
  options: { value: string; display: string }[];
  onChange: (value: string) => void;
  tier?: ConfidenceTier;
  // Options that can't be picked right now -- e.g. Payment's "Not Paid" is
  // disabled while Member Status is Non-Member (Kareem, 2026-08-17: a
  // walk-in must always pay on the spot). Shown greyed out rather than
  // hidden, so it's clear the option exists but isn't allowed here.
  disabledOptionValues?: string[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ ...fieldLabelStyle, color: tierColor[tier] }}>{label}</span>
      <div style={{ display: "flex", gap: 8 }}>
        {options.map((opt) => {
          const disabled = disabledOptionValues.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              style={{
                ...toggleButtonStyle,
                ...(value === opt.value ? toggleButtonActiveStyle : null),
                ...tierInputStyle(tier),
                ...(disabled ? disabledButtonStyle : null),
              }}
            >
              {opt.display}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A single-button toggle, specific to Slip Type (Kareem, 2026-08-17):
// locked (no longer clickable) once the model reads it with full
// confidence, showing the real value in green. Otherwise it starts as a
// neutral red "SELECT" prompt rather than silently carrying through a
// shaky guess -- clicking it both confirms a value (flipping Bar/Restaurant
// each press, same as before) and marks it reviewed, switching to amber
// with the real value shown from then on.
function SlipTypeToggle({
  value,
  options,
  onChange,
  tier,
}: {
  value: string;
  options: { value: string; display: string }[];
  onChange: (value: string) => void;
  tier: ConfidenceTier;
}) {
  const [resolved, setResolved] = useState(false);
  const locked = tier === "certain";
  const needsSelect = !locked && !resolved;
  const displayTier: ConfidenceTier = locked ? "certain" : needsSelect ? "low" : "unsure";
  const current = options.find((opt) => opt.value === value) ?? options[0];
  const next = options.find((opt) => opt.value !== current.value) ?? options[1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ ...fieldLabelStyle, color: tierColor[displayTier] }}>Slip Type</span>
      <button
        type="button"
        disabled={locked}
        onClick={() => {
          onChange(next.value);
          setResolved(true);
        }}
        style={{
          ...toggleButtonStyle,
          ...toggleButtonActiveStyle,
          ...tierInputStyle(displayTier),
          ...(locked ? { cursor: "default" } : null),
        }}
      >
        {needsSelect ? "SELECT" : current.display}
      </button>
    </div>
  );
}

// dd/mm/yyyy <-> yyyy-mm-dd -- <input type="date"> only accepts/emits ISO,
// regardless of how the browser displays it to the person (locale-aware --
// on a Philippines device that's normally day/month/year already, which is
// what gives this field its calendar picker for free). Everywhere else in
// the app keeps working with the same dd/mm/yyyy string it already
// expects (lib/dateNormalize.ts, salesOrderRows.ts) -- this conversion is
// local to how the field displays/edits it, not a format change.
function ddMmYyyyToIso(value: string): string {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function isoToDdMmYyyy(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function Field({
  label,
  value,
  onChange,
  tier = "certain",
  readOnly = false,
  type = "text",
  bold = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  tier?: ConfidenceTier;
  readOnly?: boolean;
  type?: "text" | "date";
  bold?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flex: 1,
        fontSize: 13,
        color: tierColor[tier],
      }}
    >
      {label}
      <input
        type={type}
        value={type === "date" ? ddMmYyyyToIso(value) : value}
        onChange={(e) => onChange(type === "date" ? isoToDdMmYyyy(e.target.value) : e.target.value)}
        readOnly={readOnly}
        style={{
          ...inputStyle,
          ...tierInputStyle(tier),
          ...(readOnly ? readOnlyInputStyle : null),
          ...(bold ? { fontWeight: 700 } : null),
        }}
      />
    </label>
  );
}


const fieldLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#333",
};

// color and background are both explicit here, not left to inherit --
// this app has no real dark-mode design, but app/globals.css sets a dark
// `color` on <body> when the device is in dark mode (via the --foreground
// CSS variable), which was cascading into every input/select. Combined
// with this white background (explicit on selectStyle, browser-default on
// inputStyle on some mobile browsers even under a dark color-scheme), text
// and background ended up the same color -- unreadable (reported
// 2026-08-16: "customer name and waitress box... white box with white
// text").
const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 15,
  borderRadius: 6,
  border: "1px solid #ccc",
  flex: 1,
  color: "#111",
  background: "#fff",
};

const selectStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 15,
  borderRadius: 6,
  border: "1px solid #ccc",
  color: "#111",
  background: "#fff",
};

// Colors chosen to stay legible on the app's fixed light input backgrounds
// (see the color/background comment on inputStyle above) regardless of the
// device's system theme -- amber rather than pure yellow, which reads
// poorly against white.
const tierColor: Record<ConfidenceTier, string> = {
  certain: "#2e7d32",
  unsure: "#b8860b",
  low: "#b00020",
};

function tierInputStyle(tier: ConfidenceTier): React.CSSProperties {
  return { borderColor: tierColor[tier], borderWidth: 2 };
}

const readOnlyInputStyle: React.CSSProperties = {
  background: "#f4f4f4",
  color: "#555",
  cursor: "default",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "14px 20px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid #333",
  background: "#171717",
  color: "#fff",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: 14,
  borderRadius: 8,
  border: "1px solid #999",
  background: "#fff",
  color: "#333",
  cursor: "pointer",
};

const chipButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  borderRadius: 999,
  border: "1px solid #999",
  background: "#f4f4f4",
  color: "#333",
  cursor: "pointer",
};

// Red, distinct from the neutral secondaryButtonStyle -- Remove is
// destructive (Kareem, 2026-08-17).
const removeButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: 14,
  borderRadius: 8,
  border: "1px solid #b00020",
  background: "#fff",
  color: "#b00020",
  cursor: "pointer",
};

const suggestionsToggleStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: 0,
  border: "none",
  background: "none",
  color: "#b8860b",
  fontSize: 12,
  textDecoration: "underline",
  cursor: "pointer",
};

// Deliberately not reusing tierColor's amber -- approval is a separate
// review-workflow state from field-confidence coloring, even though it
// uses the same "yellow means pending, not wrong" visual language Kareem
// asked for (2026-08-17): pending = amber, approved = green with a tick.
const approveButtonPendingStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid #b8860b",
  background: "#b8860b",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};

const approveButtonApprovedStyle: React.CSSProperties = {
  ...approveButtonPendingStyle,
  border: "1px solid #2e7d32",
  background: "#2e7d32",
};

const disabledButtonStyle: React.CSSProperties = {
  opacity: 0.5,
  cursor: "not-allowed",
};

const toggleButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 12px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#fff",
  color: "#333",
  cursor: "pointer",
};

const toggleButtonActiveStyle: React.CSSProperties = {
  background: "#171717",
  borderColor: "#171717",
  color: "#fff",
};

const totalRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 15,
  fontWeight: 600,
  padding: "8px 4px",
  borderTop: "2px solid #ccc",
};
