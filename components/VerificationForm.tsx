"use client";

import { useState } from "react";
import type { OrderSlipExtraction, OrderSlipItem } from "@/lib/extractSchema";
import { makeId } from "@/lib/makeId";
import { matchItemCodeCandidates, ITEM_MATCH_CONFIDENT_THRESHOLD, type ItemCodeEntry } from "@/lib/itemCodeScoring";
import { Spinner } from "@/components/Spinner";

export type EditableItem = OrderSlipItem & { id: string };
export type EditableOrder = Omit<OrderSlipExtraction, "items" | "uncertain_fields" | "overall_confidence"> & {
  items: EditableItem[];
};

const MANUAL_CUSTOMER = "__MANUAL__";
const MANUAL_WAITRESS = "__MANUAL__";
const CLASS_OPTIONS = ["Restaurant", "Bar"];
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

interface UncertainFields {
  top: Set<string>;
  items: Map<number, Set<string>>;
}

// Entries look like "order_slip_date" or "items[1].amount", sometimes with a
// parenthetical explanation appended server-side (e.g. "items[0].item (no
// confident code match — check manually)") -- the field path itself never
// contains a space, so splitting on the first space strips that cleanly.
function parseUncertainFields(raw: string[]): UncertainFields {
  const top = new Set<string>();
  const items = new Map<number, Set<string>>();
  for (const entry of raw) {
    const path = entry.split(" ")[0];
    const itemMatch = path.match(/^items\[(\d+)]\.(\w+)$/);
    if (itemMatch) {
      const index = Number(itemMatch[1]);
      if (!items.has(index)) items.set(index, new Set());
      items.get(index)!.add(itemMatch[2]);
    } else {
      top.add(path);
    }
  }
  return { top, items };
}

function toEditable(extraction: OrderSlipExtraction): EditableOrder {
  return {
    customer_written: extraction.customer_written,
    customer_suggested: extraction.customer_suggested,
    waitress: extraction.waitress,
    slip_type: extraction.slip_type,
    member_status: extraction.member_status,
    order_slip_date: extraction.order_slip_date,
    order_slip_number: extraction.order_slip_number,
    terms: extraction.terms,
    memo: extraction.memo,
    items: extraction.items.map((item) => ({ ...item, id: makeId() })),
  };
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
  const [order, setOrder] = useState<EditableOrder>(() => initialOrder ?? toEditable(extraction));
  const [showPhoto, setShowPhoto] = useState(false);
  // Only used for the Member branch of the Customer field (a select/manual
  // toggle, same as before). Non-Member is always free text -- see the
  // render below for why (a real bug, fixed 2026-08-15: it isn't a fixed
  // roster like Members, so a dropdown-first UI blocked easy correction,
  // and it must never show a real member's name as a "suggestion").
  const [customerMode, setCustomerMode] = useState<"select" | "manual">(
    order.customer_suggested ? "select" : order.customer_written ? "select" : "manual"
  );
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [waitressMode, setWaitressMode] = useState<"select" | "manual">(
    order.waitress ? "select" : "manual"
  );

  const uncertain = parseUncertainFields(extraction.uncertain_fields);

  const total = order.items.reduce((sum, item) => sum + (parseNumeric(item.amount) ?? 0), 0);

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
  }

  function deleteItem(id: string) {
    if (!confirm("Sure to remove item?")) return;
    setOrder((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }));
  }

  function addItem() {
    setOrder((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
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
        <ToggleField
          label="Slip Type"
          value={order.slip_type}
          options={SLIP_TYPE_TOGGLE_OPTIONS}
          onChange={(v) => updateField("slip_type", v)}
          uncertain={uncertain.top.has("slip_type")}
        />

        <Field
          label="Slip Number"
          value={order.order_slip_number}
          onChange={(v) => updateField("order_slip_number", v)}
          uncertain={uncertain.top.has("order_slip_number")}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...fieldLabelStyle, color: uncertain.top.has("customer_written") ? "#b00020" : fieldLabelStyle.color }}>
            Customer / Name
          </span>

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
              style={inputStyle}
            />
          ) : customerMode === "select" ? (
            <select
              value={order.customer_suggested}
              onChange={(e) => handleCustomerSelectChange(e.target.value)}
              style={selectStyle}
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
                style={inputStyle}
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
          onChange={(v) => updateField("member_status", v)}
          uncertain={uncertain.top.has("member_status")}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              ...fieldLabelStyle,
              color: uncertain.top.has("waitress") || uncertain.top.has("waitress_written") ? "#b00020" : fieldLabelStyle.color,
            }}
          >
            Waitress
          </span>

          {waitressMode === "select" ? (
            <select value={order.waitress} onChange={(e) => handleWaitressSelectChange(e.target.value)} style={selectStyle}>
              <option value="">— None —</option>
              {likelyWaitresses.length > 0 && (
                <optgroup label="Likely matches">
                  {likelyWaitresses.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({Math.round(m.score * 100)}%)
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
                style={inputStyle}
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
          value={order.order_slip_date}
          onChange={(v) => updateField("order_slip_date", v)}
          uncertain={uncertain.top.has("order_slip_date")}
        />

        <Field
          label="Memo"
          value={order.memo}
          onChange={(v) => updateField("memo", v)}
          uncertain={uncertain.top.has("memo")}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ fontSize: 16 }}>Items</h2>
        {order.items.map((item, index) => {
          const itemUncertain = uncertain.items.get(index) ?? new Set<string>();
          return (
            <div
              key={item.id}
              style={{
                border: "1px solid #ccc",
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
                    uncertain={itemUncertain.has("qty")}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <Field
                    label="Description"
                    value={item.description}
                    onChange={(v) => updateItem(item.id, "description", v)}
                    uncertain={itemUncertain.has("description")}
                  />
                </div>
                <div style={{ width: 90 }}>
                  <Field
                    label="Item Code"
                    value={item.item}
                    onChange={(v) => updateItem(item.id, "item", v)}
                    // Clears the moment there's any value, whether from a
                    // candidate chip or typed directly -- unlike the other
                    // fields, "uncertain" here means "still blank," not a
                    // static flag from the original extraction.
                    uncertain={itemUncertain.has("item") && !item.item}
                  />
                </div>
                <div style={{ width: 76 }}>
                  <Field
                    label="Amount"
                    value={item.amount}
                    onChange={(v) => updateItem(item.id, "amount", v)}
                    uncertain={itemUncertain.has("amount")}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => deleteItem(item.id)}
                  aria-label="Delete item"
                  style={deleteIconButtonStyle}
                >
                  ×
                </button>
              </div>

              {!item.item &&
                (item.candidates ?? [])
                  .filter((c) => c.score >= 0.3 && c.description !== item.description).length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(item.candidates ?? [])
                    .filter((c) => c.score >= 0.3 && c.description !== item.description)
                    .slice(0, 4)
                    .map((c) => (
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
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ width: 76 }}>
                  <Field label="Rate" value={item.rate} onChange={() => {}} readOnly />
                </div>
                <SelectField
                  label="Class"
                  value={item.class}
                  options={CLASS_OPTIONS}
                  onChange={(v) => updateItem(item.id, "class", v)}
                  uncertain={itemUncertain.has("class")}
                />
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
        uncertain={uncertain.top.has("terms")}
      />

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={onRetake} disabled={saving} style={secondaryButtonStyle}>
          {onRetakeLabel}
        </button>
        <button onClick={handleConfirmClick} disabled={saving} style={{ ...primaryButtonStyle, flex: 1 }}>
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
  uncertain = false,
}: {
  label: string;
  value: string;
  options: { value: string; display: string }[];
  onChange: (value: string) => void;
  uncertain?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ ...fieldLabelStyle, color: uncertain ? "#b00020" : fieldLabelStyle.color }}>{label}</span>
      <div style={{ display: "flex", gap: 8 }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              ...toggleButtonStyle,
              ...(value === opt.value ? toggleButtonActiveStyle : null),
              ...(uncertain ? uncertainInputStyle : null),
            }}
          >
            {opt.display}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  uncertain = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  uncertain?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flex: 1,
        fontSize: 13,
        color: uncertain ? "#b00020" : "#333",
      }}
    >
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        style={{
          ...inputStyle,
          ...(uncertain ? uncertainInputStyle : null),
          ...(readOnly ? readOnlyInputStyle : null),
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  uncertain = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  uncertain?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flex: 1,
        fontSize: 13,
        color: uncertain ? "#b00020" : "#333",
      }}
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...selectStyle, ...(uncertain ? uncertainInputStyle : null) }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
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

const uncertainInputStyle: React.CSSProperties = {
  borderColor: "#b00020",
  borderWidth: 2,
};

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

const deleteIconButtonStyle: React.CSSProperties = {
  width: 34,
  height: 42,
  fontSize: 18,
  lineHeight: 1,
  borderRadius: 6,
  border: "1px solid #b00020",
  background: "#fff",
  color: "#b00020",
  cursor: "pointer",
  flexShrink: 0,
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
