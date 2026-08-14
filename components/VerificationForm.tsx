"use client";

import { useState } from "react";
import type { OrderSlipExtraction, OrderSlipItem } from "@/lib/extractSchema";

export type EditableItem = OrderSlipItem & { id: string };
export type EditableOrder = Omit<OrderSlipExtraction, "items" | "uncertain_fields" | "overall_confidence"> & {
  items: EditableItem[];
};

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
    ar_number: extraction.ar_number,
    terms: extraction.terms,
    memo: extraction.memo,
    class: extraction.class,
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
  const customerName = order.customer_suggested || order.customer_written;
  const alternates = (extraction.customer_matches ?? []).filter((m) => m.name !== customerName);

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Field label="Customer / Name" value={customerName} onChange={(v) => updateField("customer_suggested", v)} />
          {order.customer_written && order.customer_written !== customerName && (
            <span style={{ fontSize: 12, color: "#777" }}>Handwriting read as: &ldquo;{order.customer_written}&rdquo;</span>
          )}
          {alternates.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {alternates.map((match) => (
                <button
                  key={match.name}
                  onClick={() => updateField("customer_suggested", match.name)}
                  style={chipButtonStyle}
                >
                  {match.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <Field label="Order Slip Date" value={order.order_slip_date} onChange={(v) => updateField("order_slip_date", v)} />
        <Field label="Order Slip Number" value={order.order_slip_number} onChange={(v) => updateField("order_slip_number", v)} />
        <Field label="AR Number" value={order.ar_number} onChange={(v) => updateField("ar_number", v)} />
        <Field label="Terms" value={order.terms} onChange={(v) => updateField("terms", v)} />
        <Field label="Memo" value={order.memo} onChange={(v) => updateField("memo", v)} />
        <Field label="Class" value={order.class} onChange={(v) => updateField("class", v)} />
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
            <Field label="Invoice Class" value={item.invoice_class} onChange={(v) => updateItem(item.id, "invoice_class", v)} />
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
        <button onClick={() => onConfirm(order)} disabled={saving} style={{ ...primaryButtonStyle, flex: 1 }}>
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
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "10px 12px",
          fontSize: 15,
          borderRadius: 6,
          border: "1px solid #ccc",
        }}
      />
    </label>
  );
}

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
