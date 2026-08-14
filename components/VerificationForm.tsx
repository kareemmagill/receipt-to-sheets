"use client";

import { useState } from "react";
import type { OrderSlipExtraction, OrderSlipItem } from "@/lib/extractSchema";

export type EditableItem = OrderSlipItem & { id: string };
export type EditableOrder = Omit<OrderSlipExtraction, "items" | "uncertain_fields" | "overall_confidence"> & {
  items: EditableItem[];
};

const MANUAL_CUSTOMER = "__MANUAL__";
const CLASS_OPTIONS = ["Restaurant", "Bar"];
const TERMS_OPTIONS = ["COD", "CREDIT"];

// crypto.randomUUID() requires a secure context (HTTPS or localhost) and is
// unavailable when testing over plain HTTP on a phone via LAN IP.
let nextId = 0;
function makeId() {
  nextId += 1;
  return `item-${Date.now()}-${nextId}`;
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
        // Amount = Rate x QTY. Recalculate Amount when either changes, but
        // leave it alone if the user edits Amount directly — that edit wins
        // until QTY or Rate changes again.
        if (field === "qty" || field === "rate") {
          const qty = parseNumeric(updated.qty);
          const rate = parseNumeric(updated.rate);
          if (qty !== null && rate !== null) {
            updated.amount = formatAmount(qty * rate);
          }
        }
        return updated;
      }),
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
      {extraction.uncertain_fields.length > 0 && (
        <div
          style={{
            background: "#fff8e1",
            border: "1px solid #e0b400",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
            color: "#6b5200",
          }}
        >
          <strong>Double-check these before saving:</strong>
          <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
            {extraction.uncertain_fields.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={fieldLabelStyle}>Customer / Name</span>

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

        <Field label="Order Slip Date" value={order.order_slip_date} onChange={(v) => updateField("order_slip_date", v)} />
        <Field label="Order Slip Number" value={order.order_slip_number} onChange={(v) => updateField("order_slip_number", v)} />
        <SelectField label="Terms" value={order.terms} options={TERMS_OPTIONS} onChange={(v) => updateField("terms", v)} />
        <Field label="Memo" value={order.memo} onChange={(v) => updateField("memo", v)} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 16 }}>Items</h2>
        {order.items.map((item, index) => (
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
            <Field label="Item" value={item.item} onChange={(v) => updateItem(item.id, "item", v)} />
            <Field label="Description" value={item.description} onChange={(v) => updateItem(item.id, "description", v)} />
            <div style={{ display: "flex", gap: 8 }}>
              <Field label="QTY" value={item.qty} onChange={(v) => updateItem(item.id, "qty", v)} />
              <Field label="Rate" value={item.rate} onChange={(v) => updateItem(item.id, "rate", v)} />
              <Field label="Amount" value={item.amount} onChange={(v) => updateItem(item.id, "amount", v)} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <SelectField
                label="Class"
                value={item.class}
                options={CLASS_OPTIONS}
                onChange={(v) => updateItem(item.id, "class", v)}
              />
              <Field label="Invoice Class" value={item.invoice_class} onChange={(v) => updateItem(item.id, "invoice_class", v)} />
            </div>
          </div>
        ))}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, fontSize: 13, color: "#333" }}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, fontSize: 13, color: "#333" }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
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

const deleteButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #b00020",
  background: "#fff",
  color: "#b00020",
  cursor: "pointer",
};
