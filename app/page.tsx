"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OrderSlipExtraction } from "@/lib/extractSchema";
import type { ItemCodeEntry } from "@/lib/itemCodeScoring";
import type { ExistingOrderSummary } from "@/lib/duplicateCheck";
import VerificationForm, { type EditableOrder } from "@/components/VerificationForm";
import { Spinner } from "@/components/Spinner";
import { loadLastPhoto, saveLastPhoto } from "@/lib/lastPhotoStore";
import { resizeImage } from "@/lib/resizeImage";

// Cap for the copy archived to Google Drive on save -- generous enough to
// stay legible (well above the 1568px OCR-read copy) while keeping the
// base64 payload comfortably under Vercel's request body limit, which the
// true full-resolution original was silently exceeding.
const ARCHIVAL_MAX_DIMENSION = 2200;

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [lastImageDataUrl, setLastImageDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<OrderSlipExtraction | null>(null);
  const [itemTemplate, setItemTemplate] = useState<ItemCodeEntry[]>([]);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<EditableOrder | null>(null);
  // Set when the scanned slip number already has a record -- non-null
  // switches the UI to the "already exists" screen (see handleUpdateExisting)
  // instead of the normal verification form.
  const [existingOrder, setExistingOrder] = useState<ExistingOrderSummary | null>(null);
  // Set right after OCR extraction, before the verification form is shown,
  // if the scanned slip type + number already has a record -- switches the
  // UI to the "Slip Already Recorded" screen (Kareem, 2026-08-17). A
  // separate state from existingOrder above: that one only ever fires
  // *after* a save attempt (using the reviewer's edited data), this one
  // fires immediately off the raw OCR read, before any review has happened.
  const [duplicateSlip, setDuplicateSlip] = useState<ExistingOrderSummary | null>(null);
  const [savedOrder, setSavedOrder] = useState<EditableOrder | null>(null);
  const [savedPhotoLink, setSavedPhotoLink] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
  // Non-null while the verification form should replace an existing record
  // on save rather than append a new one -- either re-opening the form to
  // edit an order that was already saved this session (see
  // handleEditSaved), or proceeding past the "Slip Already Recorded"
  // screen to update it with fresh OCR data (see handleProceedToUpdate).
  // Holds the slip number, not AR number -- the chit's own printed number
  // is always unique (Kareem, 2026-08-16) and, unlike AR number, present
  // even on legacy rows that predate this app.
  const [editingSlipNumber, setEditingSlipNumber] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting" | "deleted" | "error">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    loadLastPhoto()
      .then((dataUrl) => {
        if (dataUrl) setLastImageDataUrl(dataUrl);
      })
      .catch(() => {});
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("idle");
    setError(null);
    setExtraction(null);
    setSaveStatus("idle");
    setSaveError(null);
    setExistingOrder(null);
    setDuplicateSlip(null);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageDataUrl(result);
      setLastImageDataUrl(result);
      saveLastPhoto(result).catch(() => {});
    };
    reader.readAsDataURL(file);
  }

  function handleUseLastPhoto() {
    if (!lastImageDataUrl) return;
    setStatus("idle");
    setError(null);
    setExtraction(null);
    setSaveStatus("idle");
    setSaveError(null);
    setExistingOrder(null);
    setDuplicateSlip(null);
    setImageDataUrl(lastImageDataUrl);
  }

  async function handleProcess() {
    if (!imageDataUrl) return;
    setStatus("loading");
    setError(null);
    setExtraction(null);
    setDuplicateSlip(null);

    try {
      const resizedForApi = await resizeImage(imageDataUrl);
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: resizedForApi }),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error ?? "Unknown error");
        setStatus("error");
        return;
      }

      setExtraction(data.extraction);
      setItemTemplate(data.itemTemplate ?? []);
      setStatus("idle");

      // Check for an existing record under this exact slip type + number
      // right away, before the reviewer goes through the whole
      // verification form -- best-effort: if this lookup itself fails, the
      // save-time duplicate check further down still catches it.
      const slipNumber = (data.extraction?.order_slip_number ?? "").trim();
      if (slipNumber) {
        try {
          const dupRes = await fetch("/api/check-duplicate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slipType: data.extraction.slip_type, slipNumber }),
          });
          const dupData = await dupRes.json();
          if (dupData.ok && dupData.existing) {
            setDuplicateSlip(dupData.existing);
          }
        } catch {
          // Best-effort -- see comment above.
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function handleRetake() {
    setExtraction(null);
    setSaveStatus("idle");
    setSaveError(null);
    setPendingOrder(null);
    setExistingOrder(null);
    setDuplicateSlip(null);
    setSavedOrder(null);
    setSavedPhotoLink(null);
    setPhotoWarning(null);
    setEditingSlipNumber(null);
    setDeleteStatus("idle");
    setDeleteError(null);
    setImageDataUrl(null);
  }

  function handleEditSaved() {
    if (!savedOrder) return;
    setEditingSlipNumber(savedOrder.order_slip_number);
    setSaveStatus("idle");
  }

  function handleCancelEdit() {
    setEditingSlipNumber(null);
    setSaveStatus("success");
  }

  async function handleDeleteSaved() {
    if (!savedOrder?.order_slip_number) return;
    if (!confirm("Delete this saved order? This can't be undone.")) return;

    setDeleteStatus("deleting");
    setDeleteError(null);
    try {
      const res = await fetch("/api/delete-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slipNumber: savedOrder.order_slip_number }),
      });
      const data = await res.json();
      if (!data.ok) {
        setDeleteError(data.error ?? "Unknown error");
        setDeleteStatus("error");
        return;
      }
      setDeleteStatus("deleted");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      setDeleteStatus("error");
    }
  }

  // replaceSlipNumberOverride is used by "Update Record" (see
  // handleUpdateExisting) when the scanned slip number already exists but
  // wasn't from this app's own post-save "Edit" flow (editingSlipNumber).
  // Both mean the same thing to /api/save: replace that specific order.
  async function handleConfirm(order: EditableOrder, replaceSlipNumberOverride?: string) {
    const replaceSlipNumber = replaceSlipNumberOverride ?? editingSlipNumber ?? undefined;

    setSaveStatus("saving");
    setSaveError(null);
    setPendingOrder(order);

    try {
      // Re-saving an already-archived photo would just duplicate it in
      // Drive for no benefit -- the physical chit hasn't changed, only the
      // extracted data has.
      const archivalImage =
        !replaceSlipNumber && imageDataUrl ? await resizeImage(imageDataUrl, ARCHIVAL_MAX_DIMENSION) : undefined;

      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order,
          imageDataUrl: archivalImage,
          replaceSlipNumber,
        }),
      });
      const data = await res.json();

      if (data.exists) {
        setSaveError(data.error ?? "This slip number is already recorded.");
        setExistingOrder(data.existing ?? null);
        setSaveStatus("error");
        return;
      }
      if (!data.ok) {
        setSaveError(data.error ?? "Unknown error");
        setSaveStatus("error");
        return;
      }

      setSavedOrder(order);
      setSavedPhotoLink(data.photoLink ?? (replaceSlipNumber ? savedPhotoLink : null));
      setPhotoWarning(data.photoWarning ?? data.replaceWarning ?? null);
      setEditingSlipNumber(null);
      setExistingOrder(null);
      setDeleteStatus("idle");
      setSaveStatus("success");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaveStatus("error");
    }
  }

  function handleUpdateExisting() {
    if (!pendingOrder || !existingOrder?.slipNumber) return;
    handleConfirm(pendingOrder, existingOrder.slipNumber);
  }

  // From the "Slip Already Recorded" screen -- proceeds into the normal
  // verification form using the fresh OCR extraction (already held in
  // `extraction`), with editingSlipNumber set so the eventual save replaces
  // the existing record instead of appending a new one.
  function handleProceedToUpdate() {
    if (!duplicateSlip) return;
    setEditingSlipNumber(duplicateSlip.slipNumber);
    setDuplicateSlip(null);
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
        <h1 style={{ fontSize: 20 }}>PGYC Order Slip Scanner</h1>
        <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
          <Link href="/reports" style={{ color: "#555" }}>
            Reports
          </Link>
          <Link href="/batch" style={{ color: "#555" }}>
            Batch Import
          </Link>
          <Link href="/development" style={{ color: "#555" }}>
            Development
          </Link>
        </div>
      </div>

      {!extraction && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          {/* No `capture` attribute -- that's what forces straight to camera
              on the input above. Omitting it lets the browser offer the
              photo library instead. */}
          <input
            ref={libraryInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => inputRef.current?.click()} style={{ ...buttonStyle, flex: 1 }}>
              {imageDataUrl ? "Retake Photo" : "Take Photo"}
            </button>
            <button
              onClick={() => libraryInputRef.current?.click()}
              style={{ ...buttonStyle, flex: 1, background: "#fff", color: "#171717" }}
            >
              Use Photo
            </button>
            {!imageDataUrl && lastImageDataUrl && (
              <button onClick={handleUseLastPhoto} style={{ ...buttonStyle, flex: 1, background: "#fff", color: "#171717" }}>
                Use Last Photo
              </button>
            )}
          </div>

          {imageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageDataUrl}
              alt="Captured order slip"
              style={{ width: "100%", borderRadius: 8, border: "1px solid #ccc" }}
            />
          )}

          {imageDataUrl && (
            <button onClick={handleProcess} disabled={status === "loading"} style={buttonStyle}>
              {status === "loading" && <Spinner />}
              {status === "loading" ? "Reading slip…" : "Process Order Slip"}
            </button>
          )}

          {error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
        </>
      )}

      {duplicateSlip && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 18 }}>Slip Already Recorded</h2>
          <p style={{ color: "#8a6d00" }}>
            Slip #{duplicateSlip.slipNumber} is already in the sheet
            {duplicateSlip.arNumber ? ` (as ${duplicateSlip.arNumber})` : ""}.
          </p>
          <ExistingOrderRecap order={duplicateSlip} />
          {duplicateSlip.photoLink && (
            <a href={duplicateSlip.photoLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
              View photo of recorded chit
            </a>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleProceedToUpdate} style={{ ...buttonStyle, flex: 1 }}>
              Update Record
            </button>
            <button onClick={handleRetake} style={secondaryButtonStyle}>
              Return to Home Page
            </button>
          </div>
        </div>
      )}

      {extraction && !duplicateSlip && !existingOrder && saveStatus !== "success" && (
        <>
          {saveStatus === "error" && <p style={{ color: "#b00020" }}>Save failed: {saveError}</p>}
          <VerificationForm
            extraction={extraction}
            itemTemplate={itemTemplate}
            initialOrder={editingSlipNumber ? (savedOrder ?? undefined) : undefined}
            photoDataUrl={imageDataUrl ?? undefined}
            onConfirm={(order) => handleConfirm(order)}
            onRetake={editingSlipNumber ? handleCancelEdit : handleRetake}
            onRetakeLabel={editingSlipNumber ? "Cancel" : "Retake Photo"}
            confirmLabel={editingSlipNumber ? "Save Changes" : "Confirm & Save"}
            saving={saveStatus === "saving"}
          />
        </>
      )}

      {existingOrder && saveStatus !== "success" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "#8a6d00" }}>{saveError}</p>
          <ExistingOrderRecap order={existingOrder} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {existingOrder.slipNumber && (
              <button
                onClick={handleUpdateExisting}
                disabled={saveStatus === "saving"}
                style={{ ...buttonStyle, flex: 1 }}
              >
                {saveStatus === "saving" && <Spinner />}
                {saveStatus === "saving" ? "Updating…" : "Update Record"}
              </button>
            )}
            <button onClick={handleRetake} disabled={saveStatus === "saving"} style={secondaryButtonStyle}>
              Back to Front Page
            </button>
          </div>
        </div>
      )}

      {saveStatus === "success" && savedOrder && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <p style={{ fontSize: 15 }}>
              Saved Chit{" "}
              <strong style={{ color: "#0a7a2f", fontSize: 18 }}>
                #{savedOrder.order_slip_number || "?"}
              </strong>
            </p>
            {savedPhotoLink && (
              <a href={savedPhotoLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                View photo of chit
              </a>
            )}
          </div>

          {photoWarning && <p style={{ color: "#8a6d00", fontSize: 12 }}>{photoWarning}</p>}

          {deleteStatus === "deleted" ? (
            <>
              <p style={{ color: "#555" }}>Deleted.</p>
              <button onClick={handleRetake} style={buttonStyle}>
                Scan Another Slip
              </button>
            </>
          ) : (
            <>
              <OrderSummary order={savedOrder} />

              {deleteError && <p style={{ color: "#b00020", fontSize: 13 }}>Delete failed: {deleteError}</p>}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={handleEditSaved} style={secondaryButtonStyle}>
                  Edit
                </button>
                <button
                  onClick={handleDeleteSaved}
                  disabled={deleteStatus === "deleting"}
                  style={dangerButtonStyle}
                >
                  {deleteStatus === "deleting" ? "Deleting…" : "Delete"}
                </button>
                <button onClick={handleRetake} style={{ ...buttonStyle, flex: 1 }}>
                  Scan Another Slip
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}

function sumAmounts(items: EditableOrder["items"]): number {
  return items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function OrderSummary({ order }: { order: EditableOrder }) {
  const slipTypeLabel =
    order.slip_type === "Bar" ? "Order Slip (Bar)" : order.slip_type === "Restaurant" ? "Food Order Slip" : "—";
  const paymentLabel = order.terms === "COD" ? "Paid" : order.terms === "CREDIT" ? "Not Paid" : "—";

  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontSize: 14,
      }}
    >
      <SummaryRow label="Slip Type" value={slipTypeLabel} />
      <SummaryRow label="Customer" value={order.customer_suggested || order.customer_written || "—"} />
      <SummaryRow label="Member Status" value={order.member_status || "—"} />
      <SummaryRow label="Waitress" value={order.waitress || "—"} />
      <SummaryRow label="Date" value={order.order_slip_date || "—"} />
      {order.memo && <SummaryRow label="Memo" value={order.memo} />}

      <div style={{ borderTop: "1px solid #eee", marginTop: 4, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {order.items.map((item) => (
          <div key={item.id} style={{ display: "flex", gap: 8, fontSize: 13 }}>
            <span style={{ width: 24, flexShrink: 0, color: "#777" }}>{item.qty}x</span>
            <span style={{ flex: 1 }}>{item.description}</span>
            <span style={{ width: 60, flexShrink: 0, color: "#777" }}>{item.item}</span>
            <span style={{ width: 60, flexShrink: 0, textAlign: "right" }}>{item.amount}</span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #eee", paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
        <span>Total</span>
        <span>{formatMoney(sumAmounts(order.items))}</span>
      </div>

      <SummaryRow label="Payment" value={paymentLabel} />
    </div>
  );
}

function ExistingOrderRecap({ order }: { order: ExistingOrderSummary }) {
  const total = order.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontSize: 14,
      }}
    >
      <SummaryRow label="Customer" value={order.customer || "—"} />
      <SummaryRow label="Date" value={order.date || "—"} />

      <div style={{ borderTop: "1px solid #eee", marginTop: 4, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {order.items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 13 }}>
            <span style={{ width: 24, flexShrink: 0, color: "#777" }}>{item.qty}x</span>
            <span style={{ flex: 1 }}>{item.description}</span>
            <span style={{ width: 60, flexShrink: 0, color: "#777" }}>{item.item}</span>
            <span style={{ width: 60, flexShrink: 0, textAlign: "right" }}>{item.amount}</span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #eee", paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
        <span>Total</span>
        <span>{formatMoney(total)}</span>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "#777" }}>{label}</span>
      <span style={{ textAlign: "right" }}>{value}</span>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "14px 20px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid #333",
  background: "#171717",
  color: "#fff",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "14px 20px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid #999",
  background: "#fff",
  color: "#333",
  cursor: "pointer",
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
