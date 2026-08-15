"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Status {
  totalRows: number;
  lastOrder: { slipNumber: string; arNumber: string; customer: string; itemCount: number } | null;
}

function describeOrder(order: { slipNumber: string; arNumber: string; customer: string; itemCount: number }) {
  const label = order.slipNumber ? `Slip #${order.slipNumber}` : order.arNumber ? order.arNumber : "(no slip number)";
  return `${label}, ${order.customer}, ${order.itemCount} row${order.itemCount === 1 ? "" : "s"}`;
}

export default function DevelopmentPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"last" | "all" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Used to re-fetch status after a delete (not on mount -- see the effect
  // below, which duplicates this fetch inline rather than calling out to
  // this function, since a lint rule can't verify a called-out function's
  // setState calls are safely inside a promise callback).
  function refreshStatus() {
    setError(null);
    return fetch("/api/dev/status")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error ?? "Unknown error");
          return;
        }
        setStatus({ totalRows: data.totalRows, lastOrder: data.lastOrder });
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    fetch("/api/dev/status")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error ?? "Unknown error");
          return;
        }
        setStatus({ totalRows: data.totalRows, lastOrder: data.lastOrder });
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  async function handleDeleteLast() {
    if (!status?.lastOrder) return;
    if (!confirm(`Delete the last record (${describeOrder(status.lastOrder)})? This can't be undone.`)) {
      return;
    }

    setBusy("last");
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/dev/delete-last", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Unknown error");
        return;
      }
      const label = data.slipNumber ? `Slip #${data.slipNumber}` : data.arNumber || "unlabeled";
      setMessage(`Deleted ${data.deleted} row${data.deleted === 1 ? "" : "s"} (${label}).`);
      refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteAll() {
    if (!status || status.totalRows === 0) return;
    const first = confirm(
      `Delete ALL ${status.totalRows} rows from Sales Orders? This can't be undone.`
    );
    if (!first) return;
    const second = confirm(`Really delete all ${status.totalRows} rows? Last chance.`);
    if (!second) return;

    setBusy("all");
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/dev/delete-all", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Unknown error");
        return;
      }
      setMessage(`Deleted ${data.deleted} row${data.deleted === 1 ? "" : "s"}.`);
      refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Development</h1>
        <Link href="/" style={{ fontSize: 13, color: "#555" }}>
          ← Back to scanner
        </Link>
      </div>

      <p style={{ fontSize: 12, color: "#777" }}>
        Testing-only tools that delete real rows from the Sales Orders sheet. There is no undo.
      </p>

      {loading && <p style={{ color: "#555" }}>Loading…</p>}
      {error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
      {message && <p style={{ color: "#0a7a2f" }}>{message}</p>}

      {status && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, color: "#555" }}>
            {status.totalRows} row{status.totalRows === 1 ? "" : "s"} in Sales Orders.
            {status.lastOrder && <> Last record: {describeOrder(status.lastOrder)}.</>}
          </p>

          <button
            onClick={handleDeleteLast}
            disabled={!status.lastOrder || busy !== null}
            style={dangerButtonStyle}
          >
            {busy === "last" ? "Deleting…" : "Delete Last Record"}
          </button>

          <button
            onClick={handleDeleteAll}
            disabled={status.totalRows === 0 || busy !== null}
            style={dangerButtonStyle}
          >
            {busy === "all" ? "Deleting…" : "Delete All Records"}
          </button>
        </div>
      )}
    </main>
  );
}

const dangerButtonStyle: React.CSSProperties = {
  padding: "14px 20px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid #b00020",
  background: "#fff",
  color: "#b00020",
  cursor: "pointer",
};
