"use client";

import { useState } from "react";
import type { OrderSlipExtraction, OrderSlipItem } from "@/lib/extractSchema";
import { makeId } from "@/lib/makeId";

export type EditableItem = OrderSlipItem & { id: string };
export type EditableOrder = Omit<OrderSlipExtraction, "items" | "uncertain_fields" | "overall_confidence"> & {
  items: EditableItem[];
};

const MANUAL_CUSTOMER = "__MANUAL__";
const CLASS_OPTIONS = ["Restaurant", "Bar"];
const TERMS_OPTIONS = ["COD", "CREDIT"];

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
  onConfirm,
  onRetake,
  saving = false,
}: {
  extraction: OrderSlipExtraction;
  onConfirm: (order: EditableOrder) => void;
  onRetake: () => void;
  saving?: boolean;
}) {
  const [order, setOrder] = useState<EditableOrder>(() => toEditable(extraction));
  const [customerMode, setCustomerMode] = useState<"select" | "manual">(
    order.customer_suggested ? "select" : order.customer_written ? "select" : "manual"
  );
  const [customerError, setCustomerError] = useState<string | null>(null);

  const uncertain = parseUncertainFields(extraction.uncertain_fields);

  const likelyMatches = (extraction.customer_matches ?? []).filter((m) => m.score >= 0.3);
  const likelyNames = new Set(likelyMatches.map((m) => m.name));
  const otherCustomers = (extraction.customer_list ?? [])
    .filter((name) => !likelyNames.has(name))
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
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...fieldLabelStyle, color: uncertain.top.has("customer_written") ? "#b00020" : fieldLabelStyle.color }}>
            Customer / Name
          </span>

          {customerMode === "select" ? (
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

          {order.customer_written && order.customer_written !== order.customer_suggested && (
            <span style={{ fontSize: 12, color: "#777" }}>Handwriting read as: &ldquo;{order.customer_written}&rdquo;</span>
          )}
          {customerError && <span style={{ fontSize: 12, color: "#b00020" }}>{customerError}</span>}
        </div>

        <Field
          label="Order Slip Date"
          value={order.order_slip_date}
          onChange={(v) => updateField("order_slip_date", v)}
          uncertain={uncertain.top.has("order_slip_date")}
        />
        <Field
          label="Order Slip Number"
          value={order.order_slip_number}
          onChange={(v) => updateField("order_slip_number", v)}
          uncertain={uncertain.top.has("order_slip_number")}
        />
        <SelectField
          label="Terms"
          value={order.terms}
          options={TERMS_OPTIONS}
          onChange={(v) => updateField("terms", v)}
          uncertain={uncertain.top.has("terms")}
        />
        <Field
          label="Memo"
          value={order.memo}
          onChange={(v) => updateField("memo", v)}
          uncertain={uncertain.top.has("memo") || uncertain.top.has("waitress_written")}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 16 }}>Items</h2>
        {order.items.map((item, index) => {
          const itemUncertain = uncertain.items.get(index) ?? new Set<string>();
          return (
          <div
            key={item.id}
            style={{
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13, color: "#555" }}>Item {index + 1}</strong>
              <button onClick={() => deleteItem(item.id)} style={deleteButtonStyle}>
                Delete
              </button>
            </div>
            <Field
              label="Item"
              value={item.item}
              onChange={(v) => updateItem(item.id, "item", v)}
              uncertain={itemUncertain.has("item")}
            />
            <Field
              label="Description"
              value={item.description}
              onChange={(v) => updateItem(item.id, "description", v)}
              uncertain={itemUncertain.has("description")}
            />
            {(item.candidates ?? [])
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
              <Field
                label="QTY"
                value={item.qty}
                onChange={(v) => updateItem(item.id, "qty", v)}
                uncertain={itemUncertain.has("qty")}
              />
              <Field label="Rate" value={item.rate} onChange={() => {}} readOnly />
              <Field
                label="Amount"
                value={item.amount}
                onChange={(v) => updateItem(item.id, "amount", v)}
                uncertain={itemUncertain.has("amount")}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
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
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={onRetake} disabled={saving} style={secondaryButtonStyle}>
          Retake Photo
        </button>
        <button onClick={handleConfirmClick} disabled={saving} style={{ ...primaryButtonStyle, flex: 1 }}>
          {saving ? "Saving…" : "Confirm & Save"}
        </button>
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

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 15,
  borderRadius: 6,
  border: "1px solid #ccc",
  flex: 1,
};

const selectStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 15,
  borderRadius: 6,
  border: "1px solid #ccc",
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

const deleteButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #b00020",
  background: "#fff",
  color: "#b00020",
  cursor: "pointer",
};
