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
import { usePageTitle } from "@/lib/usePageTitle";
import { SlipLayout } from "@/components/SlipLayout";
import { ExistingOrderRecap } from "@/components/ExistingOrderRecap";
import { formatEnteredAt } from "@/lib/formatEnteredAt";
import type { ApiUsageSummary } from "@/lib/apiUsageLog";
import { AiCostSummary } from "@/components/AiCostSummary";
import { takePendingUploadHandoff } from "@/lib/pendingUploadHandoff";

// Approximate, hand-set -- there's no live exchange-rate feed wired up.
// Anthropic bills in USD; this is purely a display conversion for
// Kareem's own reference (2026-08-18). Update this if it drifts far from
// the real rate.
const USD_TO_PHP_RATE = 58;

// Cap for the copy archived to Google Drive on save -- lowered from 2200
// to 800 (Kareem, 2026-08-17) to keep uploads faster and Drive usage
// down; still comfortably under Vercel's request body limit, which the
// true full-resolution original was silently exceeding. Below the
// 1568px OCR-read copy now, so this archived copy is for record-keeping
// (the "already recorded" screen, manual lookups), not re-reading fine
// handwriting detail.
const ARCHIVAL_MAX_DIMENSION = 800;

export default function Home() {
  usePageTitle("PGYC Order Slip Scanner");
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
  // nothing renders rather than showing a misleading ₱0.00. See
  // components/AiCostSummary.tsx for how the headline (scan-only) vs.
  // expanded per-model breakdown (everything, including Ask the Sales
  // Data) are split.
  const [usage, setUsage] = useState<ApiUsageSummary | null>(null);
  // Set when this photo came from the Process Queue page rather than a
  // live capture (see lib/pendingUploadHandoff.ts) -- its Pending Uploads
  // row is only removed once the slip actually saves successfully below,
  // not just on opening it, so an abandoned/failed attempt leaves it in
  // the queue to try again (Kareem, 2026-08-20).
  const [pendingQueueRowNumber, setPendingQueueRowNumber] = useState<number | null>(null);
  // How many photos are sitting in the Process Queue -- shown as a badge
  // on that button so staff can see there's backlog without opening it.
  const [pendingQueueCount, setPendingQueueCount] = useState(0);

  useEffect(() => {
    fetch("/api/usage-total")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setUsage({ totalCostUsd: data.totalCostUsd, scanCount: data.scanCount, scanCostUsd: data.scanCostUsd, byModel: data.byModel });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/pending-uploads")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setPendingQueueCount(data.uploads.length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Deferred via .then(), same reasoning as the userName prompt effect
    // above -- keeps the setState calls out of the synchronous effect body.
    Promise.resolve().then(() => {
      const handoff = takePendingUploadHandoff();
      if (!handoff) return;
      setStatus("idle");
      setError(null);
      setExtraction(null);
      setSaveStatus("idle");
      setSaveError(null);
      setExistingOrder(null);
      setDuplicateSlip(null);
      setImageDataUrl(handoff.imageDataUrl);
      setPendingQueueRowNumber(handoff.rowNumber);
    });
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
    setPendingQueueRowNumber(null);
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

      // Only now that the slip actually saved -- clears this photo out of
      // the Process Queue. Fire-and-forget: a failure here just leaves a
      // now-redundant row in the queue for someone to notice and clear
      // manually, not something worth blocking the save success screen on.
      if (pendingQueueRowNumber !== null) {
        fetch("/api/pending-uploads/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rowNumber: pendingQueueRowNumber }),
        }).catch(() => {});
        setPendingQueueRowNumber(null);
      }
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
          <Link href="/development" style={{ color: "#555" }}>
            Development
          </Link>
        </div>
      </div>

      {usage !== null && <AiCostSummary usage={usage} phpRate={USD_TO_PHP_RATE} />}

      {!extraction && (
        <>
          <h2 style={screenTitleStyle}>Scan a Slip</h2>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, width: "100%", minWidth: 0 }}>
                {SAMPLE_SLIPS.map((sample) => (
                  <button
                    key={sample.file}
                    type="button"
                    onClick={() => handleUseSample(sample.file)}
                    style={{ padding: 0, border: "1px solid #ccc", borderRadius: 8, background: "none", cursor: "pointer" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sample.file}
                      alt={sample.label}
                      style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 7, display: "block" }}
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

          <Link
            href="/daily-report"
            style={{ ...buttonStyle, textAlign: "center", textDecoration: "none", display: "block" }}
          >
            Sales Report
          </Link>

          <Link
            href="/members-billing"
            style={{ ...buttonStyle, textAlign: "center", textDecoration: "none", display: "block" }}
          >
            Members Billing
          </Link>

          <Link
            href="/upload-slips"
            style={{ ...buttonStyle, textAlign: "center", textDecoration: "none", display: "block" }}
          >
            Upload Slips
          </Link>

          <Link
            href="/process-queue"
            style={{ ...buttonStyle, textAlign: "center", textDecoration: "none", display: "block" }}
          >
            Process Queue{pendingQueueCount ? ` (${pendingQueueCount})` : ""}
          </Link>
        </>
      )}

      {duplicateSlip && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={screenTitleStyle}>Duplicate Slip</h2>
          <p style={{ color: "#b00020", fontSize: 18, fontWeight: 700, margin: 0 }}>
            #{duplicateSlip.slipNumber} already entered
            {duplicateSlip.enteredBy ? ` by ${duplicateSlip.enteredBy}` : ""}
            {duplicateSlip.enteredAt ? ` (${formatEnteredAt(duplicateSlip.enteredAt)})` : ""}
          </p>
          <ExistingOrderRecap order={duplicateSlip} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleProceedToUpdate} style={{ ...buttonStyle, flex: 1 }}>
              Update Record
            </button>
            <button onClick={handleRetake} style={secondaryButtonStyle}>
              Return to Home Page
            </button>
          </div>
          {duplicateSlip.photoThumbnailUrl && duplicateSlip.photoThumbnailUrl !== failedThumbnailUrl ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={duplicateSlip.photoThumbnailUrl}
                alt="Recorded slip"
                onError={() => setFailedThumbnailUrl(duplicateSlip.photoThumbnailUrl ?? null)}
                style={{ maxWidth: "100%", height: "auto", display: "block", borderRadius: 8, border: "1px solid #ccc" }}
              />
            </div>
          ) : (
            duplicateSlip.photoLink && (
              <a href={duplicateSlip.photoLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                View photo of recorded slip
              </a>
            )
          )}
        </div>
      )}

      {extraction && !duplicateSlip && !existingOrder && saveStatus !== "success" && (
        <>
          <h2 style={screenTitleStyle}>Data Entry</h2>
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
          <h2 style={screenTitleStyle}>Duplicate Slip</h2>
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
          <h2 style={screenTitleStyle}>Confirmation</h2>
          <div>
            <p style={{ fontSize: 15 }}>
              Saved Slip{" "}
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
                  <span style={{ fontSize: 12, color: "#777" }}>Saved slip photo</span>
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

function OrderSummary({ order }: { order: EditableOrder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SlipLayout
        slipNumber={order.order_slip_number || "?"}
        slipType={order.slip_type}
        customer={order.customer_suggested || order.customer_written}
        waitress={order.waitress}
        date={order.order_slip_date}
        memberStatus={order.member_status}
        items={order.items.map((item) => ({
          qty: item.qty,
          description: item.description,
          itemCode: item.item,
          amount: item.amount,
        }))}
        total={sumAmounts(order.items)}
        terms={order.terms}
      />
      {order.memo && <p style={{ fontSize: 13, color: "#777", margin: 0 }}>Memo: {order.memo}</p>}
    </div>
  );
}

// A visible heading per screen -- the top-level h1 never changes as you
// move through the flow (scan -> data entry -> duplicate -> confirmation
// are all the same route), so there was no on-page way to tell them apart
// when talking about "which page" (Kareem, 2026-08-18: "so we can be sure
// we know what page we are talking about editing").
const screenTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#999",
};

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
