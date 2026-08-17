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
import { getDeviceLabel } from "@/lib/deviceId";
import { getStoredUserName, setStoredUserName } from "@/lib/userName";
import { SAMPLE_SLIPS } from "@/lib/sampleSlips";

// Cap for the copy archived to Google Drive on save -- lowered from 2200
// to 800 (Kareem, 2026-08-17) to keep uploads faster and Drive usage
// down; still comfortably under Vercel's request body limit, which the
// true full-resolution original was silently exceeding. Below the
// 1568px OCR-read copy now, so this archived copy is for record-keeping
// (the "already recorded" screen, manual lookups), not re-reading fine
// handwriting detail.
const ARCHIVAL_MAX_DIMENSION = 800;

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
  // Set if the inline thumbnail fails to load -- e.g. a photo archived
  // before the Drive link-sharing fix (Kareem, 2026-08-17), which isn't
  // link-shareable yet. Falls back to the plain "View" link instead of a
  // broken image icon. Keyed by URL rather than a plain boolean so it
  // naturally stops applying once duplicateSlip points at a different
  // photo, with no effect/reset needed.
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null);
  // Who's using this browser -- asked once via a prompt on landing (see
  // the effect below), then remembered from localStorage on every later
  // visit. Recorded on save alongside the device label so it's clear who
  // entered each record (Kareem, 2026-08-17).
  const [userName, setUserName] = useState("");
  // Running estimate of what this app's Claude API calls have cost so far
  // (Kareem, 2026-08-17) -- null while loading/unavailable, in which case
  // nothing renders rather than showing a misleading $0.00.
  const [apiCostTotal, setApiCostTotal] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/usage-total")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setApiCostTotal(data.totalUsd);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Deferred via .then() rather than called directly in the effect body
    // -- window.prompt() is a real side effect (a blocking dialog), and
    // this pattern keeps the state updates out of the synchronous effect
    // body, same as loadLastPhoto() below.
    Promise.resolve().then(() => {
      const stored = getStoredUserName();
      if (stored) {
        setUserName(stored);
        return;
      }
      const entered = window.prompt("What's your name? (recorded against each record you save)");
      if (entered && entered.trim()) {
        setStoredUserName(entered.trim());
        setUserName(entered.trim());
      }
    });
  }, []);

  useEffect(() => {
    loadLastPhoto()
      .then((dataUrl) => {
        if (dataUrl) setLastImageDataUrl(dataUrl);
      })
      .catch(() => {});
  }, []);

  // The reviewer is usually scrolled down near Confirm & Save when a save
  // succeeds -- jump back to the top so the "Saved Chit" summary is
  // immediately visible instead of landing wherever they happened to be
  // scrolled (Kareem, 2026-08-17).
  useEffect(() => {
    if (saveStatus === "success") window.scrollTo(0, 0);
  }, [saveStatus]);

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

  // Lets testers run the full scan flow without an actual physical slip
  // (Kareem, 2026-08-17) -- fetches a bundled sample photo and feeds it in
  // exactly like a camera/library pick.
  async function handleUseSample(file: string) {
    setStatus("idle");
    setError(null);
    setExtraction(null);
    setSaveStatus("idle");
    setSaveError(null);
    setExistingOrder(null);
    setDuplicateSlip(null);

    try {
      const res = await fetch(file);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setImageDataUrl(result);
        setLastImageDataUrl(result);
        saveLastPhoto(result).catch(() => {});
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
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

      // Check for an existing record under this exact slip type + number
      // *before* committing the extraction to state -- best-effort: if
      // this lookup itself fails, the save-time duplicate check further
      // down still catches it. Deliberately not setting extraction until
      // this resolves: doing it earlier meant the verification form
      // mounted, then immediately got replaced by the "Slip Already
      // Recorded" screen a beat later -- a visible flash reported by
      // Kareem, 2026-08-17. Resolving the duplicate check first and
      // setting extraction + duplicateSlip together lands both in the
      // same render, so only the final screen ever shows.
      const slipNumber = (data.extraction?.order_slip_number ?? "").trim();
      let existing: ExistingOrderSummary | null = null;
      if (slipNumber) {
        try {
          const dupRes = await fetch("/api/check-duplicate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slipType: data.extraction.slip_type, slipNumber }),
          });
          const dupData = await dupRes.json();
          if (dupData.ok && dupData.existing) existing = dupData.existing;
        } catch {
          // Best-effort -- see comment above.
        }
      }

      setExtraction(data.extraction);
      setItemTemplate(data.itemTemplate ?? []);
      setDuplicateSlip(existing);
      setStatus("idle");
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
          enteredBy: userName,
          device: getDeviceLabel(),
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
        width: "100%",
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
          <Link href="/daily-report" style={{ color: "#555" }}>
            Daily Report
          </Link>
          <Link href="/development" style={{ color: "#555" }}>
            Development
          </Link>
        </div>
      </div>

      {apiCostTotal !== null && (
        <p style={{ fontSize: 15, color: "#999", margin: 0 }}>
          API usage so far: ${apiCostTotal.toFixed(2)}
        </p>
      )}

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

          {!imageDataUrl && SAMPLE_SLIPS.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", minWidth: 0 }}>
              <span style={{ fontSize: 15, color: "#555" }}>No slip on hand? Try a sample:</span>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", width: "100%", minWidth: 0 }}>
                {SAMPLE_SLIPS.map((sample) => (
                  <button
                    key={sample.file}
                    type="button"
                    onClick={() => handleUseSample(sample.file)}
                    style={{ padding: 0, border: "1px solid #ccc", borderRadius: 8, background: "none", cursor: "pointer", flexShrink: 0 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sample.file}
                      alt={sample.label}
                      style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 7, display: "block" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {imageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageDataUrl}
              alt="Captured order slip"
              style={{ maxWidth: "100%", height: "auto", display: "block", borderRadius: 8, border: "1px solid #ccc" }}
            />
          )}

          {imageDataUrl && (
            <button onClick={handleProcess} disabled={status === "loading"} style={buttonStyle}>
              {status === "loading" && <Spinner />}
              {status === "loading" ? "Reading slip…" : "Process Order Slip"}
            </button>
          )}

          {imageDataUrl && (
            <button onClick={handleRetake} disabled={status === "loading"} style={secondaryButtonStyle}>
              Return to Home Page
            </button>
          )}

          {error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
        </>
      )}

      {duplicateSlip && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <p style={{ color: "#b00020", fontSize: 18, fontWeight: 700, margin: 0 }}>
              Slip #{duplicateSlip.slipNumber} already entered!
            </p>
            {duplicateSlip.enteredAt && (
              <p style={{ color: "#777", fontSize: 13, margin: 0 }}>
                Entered on {formatEnteredAt(duplicateSlip.enteredAt)}
                {duplicateSlip.enteredBy ? ` by ${duplicateSlip.enteredBy}` : ""}
              </p>
            )}
          </div>
          <ExistingOrderRecap order={duplicateSlip} />
          {duplicateSlip.photoThumbnailUrl && duplicateSlip.photoThumbnailUrl !== failedThumbnailUrl ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={duplicateSlip.photoThumbnailUrl}
                alt="Recorded chit"
                onError={() => setFailedThumbnailUrl(duplicateSlip.photoThumbnailUrl ?? null)}
                style={{ maxWidth: "100%", height: "auto", display: "block", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </div>
          ) : (
            duplicateSlip.photoLink && (
              <a href={duplicateSlip.photoLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                View photo of recorded chit
              </a>
            )
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

              {imageDataUrl && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "#777" }}>Saved chit photo</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageDataUrl}
                    alt="Saved order slip"
                    style={{ maxWidth: "100%", height: "auto", display: "block", borderRadius: 8, border: "1px solid #ccc" }}
                  />
                </div>
              )}
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

// Stored as ISO/UTC (see buildSalesOrderRows) -- displayed in the viewer's
// own local time, dd/mm/yyyy to match the rest of the app's date format.
function formatEnteredAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
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
