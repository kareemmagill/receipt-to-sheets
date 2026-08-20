"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePageTitle } from "@/lib/usePageTitle";
import { useSlipViewer } from "@/lib/useSlipViewer";
import { SlipViewerModal } from "@/components/SlipViewerModal";

interface Status {
  totalRows: number;
  lastOrder: { slipNumber: string; arNumber: string; customer: string; itemCount: number } | null;
}

interface Record {
  slipNumber: string;
  arNumber: string;
  customer: string;
  date: string;
  summary: string;
  total: number;
  photoLink: string | null;
  enteredBy: string;
  enteredAt: string;
}

interface PendingUpload {
  rowNumber: number;
  photoLink: string;
  photoThumbnailUrl?: string;
  uploadedAt: string;
  uploadedBy: string;
  device: string;
}

// Timestamp, not a relative label -- this table is a diagnostic list of
// many records at once, where "Just Now" from an earlier scan would read
// wrong by the time anyone looks at it (Kareem, 2026-08-20).
function formatDigitizedAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
}

function describeOrder(order: { slipNumber: string; arNumber: string; customer: string; itemCount: number }) {
  const label = order.slipNumber ? `Slip #${order.slipNumber}` : order.arNumber ? order.arNumber : "(no slip number)";
  return `${label}, ${order.customer}, ${order.itemCount} row${order.itemCount === 1 ? "" : "s"}`;
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DevelopmentPage() {
  usePageTitle("Development");
  const [status, setStatus] = useState<Status | null>(null);
  const [records, setRecords] = useState<Record[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"last" | "all" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [pendingUploads, setPendingUploads] = useState<PendingUpload[] | null>(null);
  const [pendingBusy, setPendingBusy] = useState<"all" | number | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);

  // Same combined photo + digitised SlipLayout viewer used on Sales Report
  // and Members Billing (Kareem, 2026-08-20: "link the slip number to the
  // digital slip, and open the photo without leaving the site") -- one
  // hook shared across every screen with a clickable slip number.
  const { viewingSlip, failedPhotoSlip, setFailedPhotoSlip, slipDetail, slipDetailStatus, viewSlip, closeSlip } =
    useSlipViewer();

  // Used to re-fetch after a delete (not on mount -- see the effect below,
  // which duplicates these fetches inline rather than calling out to these
  // functions, since a lint rule can't verify a called-out function's
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

  function refreshRecords() {
    return fetch("/api/dev/records")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) return;
        setRecords(data.records);
      })
      .catch(() => {});
  }

  function refreshPendingUploads() {
    return fetch("/api/pending-uploads")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setPendingError(data.error ?? "Unknown error");
          return;
        }
        setPendingUploads(data.uploads);
      })
      .catch((err) => setPendingError(err instanceof Error ? err.message : String(err)));
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

    fetch("/api/dev/records")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) return;
        setRecords(data.records);
      })
      .catch(() => {});

    fetch("/api/pending-uploads")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setPendingError(data.error ?? "Unknown error");
          return;
        }
        setPendingUploads(data.uploads);
      })
      .catch((err) => setPendingError(err instanceof Error ? err.message : String(err)));
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
      refreshRecords();
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
      refreshRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDeletePendingUpload(upload: PendingUpload) {
    if (!confirm(`Delete this pending upload (from ${upload.uploadedBy || "unknown"})? This can't be undone.`)) {
      return;
    }

    setPendingBusy(upload.rowNumber);
    setPendingError(null);
    try {
      const res = await fetch("/api/pending-uploads/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowNumber: upload.rowNumber }),
      });
      const data = await res.json();
      if (!data.ok) {
        setPendingError(data.error ?? "Unknown error");
        return;
      }
      refreshPendingUploads();
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingBusy(null);
    }
  }

  async function handleDeleteAllPendingUploads() {
    if (!pendingUploads || pendingUploads.length === 0) return;
    if (!confirm(`Delete ALL ${pendingUploads.length} pending upload(s)? This can't be undone.`)) return;

    setPendingBusy("all");
    setPendingError(null);
    try {
      const res = await fetch("/api/pending-uploads/delete-all", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setPendingError(data.error ?? "Unknown error");
        return;
      }
      refreshPendingUploads();
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingBusy(null);
    }
  }

  return (
    <main
      style={{
        width: "100%",
        maxWidth: 720,
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

          <div style={{ display: "flex", gap: 12 }}>
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
        </div>
      )}

      <section>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Records (most recent first)</h2>
        <div style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Slip #</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Order Summary</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                <th style={thStyle}>Photo</th>
                <th style={thStyle}>Digitized By</th>
                <th style={thStyle}>Digitized At</th>
              </tr>
            </thead>
            <tbody>
              {(records ?? []).map((r, i) => (
                <tr key={`${r.slipNumber || r.arNumber}|${i}`}>
                  <td style={tdStyle}>{r.date || "—"}</td>
                  <td style={tdStyle}>
                    {r.slipNumber ? (
                      <button type="button" onClick={() => viewSlip(r.slipNumber)} style={slipLinkStyle}>
                        {r.slipNumber}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={tdStyle}>{r.customer}</td>
                  <td style={tdStyle}>{r.summary}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{formatMoney(r.total)}</td>
                  <td style={tdStyle}>
                    {r.slipNumber && r.photoLink ? (
                      <button type="button" onClick={() => viewSlip(r.slipNumber)} style={slipLinkStyle}>
                        View
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={tdStyle}>{r.enteredBy || "—"}</td>
                  <td style={tdStyle}>{r.enteredAt ? formatDigitizedAt(r.enteredAt) : "—"}</td>
                </tr>
              ))}
              {records && records.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={8}>
                    No records.
                  </td>
                </tr>
              )}
              {!records && (
                <tr>
                  <td style={tdStyle} colSpan={8}>
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>
            Pending Uploads{pendingUploads ? ` (${pendingUploads.length})` : ""}
          </h2>
          <button
            onClick={handleDeleteAllPendingUploads}
            disabled={!pendingUploads || pendingUploads.length === 0 || pendingBusy !== null}
            style={dangerButtonStyle}
          >
            {pendingBusy === "all" ? "Deleting…" : "Delete All"}
          </button>
        </div>

        {pendingError && <p style={{ color: "#b00020" }}>Error: {pendingError}</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(pendingUploads ?? []).map((u) => (
            <div
              key={u.rowNumber}
              style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid #ddd", borderRadius: 8, padding: 8 }}
            >
              {u.photoThumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.photoThumbnailUrl}
                  alt="Pending upload"
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 6, background: "#eee", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, fontSize: 12, color: "#555" }}>
                {u.uploadedBy && <div>By {u.uploadedBy}</div>}
                <div>{u.uploadedAt ? formatDigitizedAt(u.uploadedAt) : ""}</div>
                <a href={u.photoLink} target="_blank" rel="noopener noreferrer">
                  View
                </a>
              </div>
              <button
                onClick={() => handleDeletePendingUpload(u)}
                disabled={pendingBusy !== null}
                style={{ ...dangerButtonStyle, padding: "8px 14px", fontSize: 13 }}
              >
                {pendingBusy === u.rowNumber ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))}
          {pendingUploads && pendingUploads.length === 0 && (
            <p style={{ fontSize: 13, color: "#777", margin: 0 }}>Nothing queued.</p>
          )}
          {!pendingUploads && <p style={{ fontSize: 13, color: "#777", margin: 0 }}>Loading…</p>}
        </div>
      </section>

      {viewingSlip && (
        <SlipViewerModal
          slipNumber={viewingSlip}
          slipDetail={slipDetail}
          slipDetailStatus={slipDetailStatus}
          failedPhotoSlip={failedPhotoSlip}
          onFailedPhoto={setFailedPhotoSlip}
          onClose={closeSlip}
        />
      )}
    </main>
  );
}

const slipLinkStyle: React.CSSProperties = {
  padding: 0,
  border: "none",
  background: "none",
  color: "#1a73e8",
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "14px 20px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid #b00020",
  background: "#fff",
  color: "#b00020",
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "2px solid #ccc",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #eee",
};
