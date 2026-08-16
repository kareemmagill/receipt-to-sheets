"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { makeId } from "@/lib/makeId";
import type { OrderSlipExtraction } from "@/lib/extractSchema";
import type { EditableOrder } from "@/components/VerificationForm";
import { resizeImage } from "@/lib/resizeImage";
import { Spinner } from "@/components/Spinner";

// See app/page.tsx for why the archived copy is downsized too, not just
// the OCR-read copy -- the full-resolution original was silently failing
// /api/save with an unparseable platform error. Kept in sync with that
// file's cap (800, Kareem, 2026-08-17).
const ARCHIVAL_MAX_DIMENSION = 800;

interface QueuedPhoto {
  id: string;
  dataUrl: string;
}

type ResultStatus = "pending" | "processing" | "done" | "error";
interface PhotoResult {
  status: ResultStatus;
  message: string;
}

function buildOrderFromExtraction(extraction: OrderSlipExtraction): EditableOrder {
  return {
    customer_written: extraction.customer_written,
    customer_suggested: extraction.customer_suggested || extraction.customer_written,
    waitress: extraction.waitress,
    slip_type: extraction.slip_type,
    member_status: extraction.member_status,
    order_slip_date: extraction.order_slip_date,
    order_slip_number: extraction.order_slip_number,
    terms: extraction.terms,
    memo: extraction.memo,
    items: extraction.items.map((item) => ({ ...item, id: makeId("item") })),
  };
}

export default function BatchImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [results, setResults] = useState<Record<string, PhotoResult>>({});
  const [processing, setProcessing] = useState(false);

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const id = makeId("photo");
      const reader = new FileReader();
      reader.onload = () => {
        setPhotos((prev) => [...prev, { id, dataUrl: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function setResult(id: string, status: ResultStatus, message: string) {
    setResults((prev) => ({ ...prev, [id]: { status, message } }));
  }

  async function handleProcessAll() {
    setProcessing(true);

    // Sequential, not parallel — AR numbers are computed from the sheet's
    // current max at save time, so concurrent saves could collide.
    for (const photo of photos) {
      setResult(photo.id, "processing", "Reading slip…");
      try {
        const resizedForApi = await resizeImage(photo.dataUrl);
        const extractRes = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: resizedForApi }),
        });
        const extractData = await extractRes.json();
        if (!extractData.ok) {
          setResult(photo.id, "error", extractData.error ?? "Extraction failed");
          continue;
        }

        const order = buildOrderFromExtraction(extractData.extraction);
        if (!order.customer_suggested.trim()) {
          setResult(photo.id, "error", "No customer name could be read");
          continue;
        }
        if (order.items.length === 0) {
          setResult(photo.id, "error", "No items could be read");
          continue;
        }

        const archivalImage = await resizeImage(photo.dataUrl, ARCHIVAL_MAX_DIMENSION);
        const saveRes = await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order, imageDataUrl: archivalImage }),
        });
        const saveData = await saveRes.json();
        if (saveData.exists) {
          // No review screen here to offer Update Record, so an exact
          // re-scan is a harmless skip but a genuine conflict needs a
          // human to look at it manually later.
          if (saveData.wasExact) {
            setResult(photo.id, "done", saveData.error ?? "Already recorded — skipped");
          } else {
            setResult(photo.id, "error", `${saveData.error} — needs manual review, skipped`);
          }
          continue;
        }
        if (!saveData.ok) {
          setResult(photo.id, "error", saveData.error ?? "Save failed");
          continue;
        }

        setResult(
          photo.id,
          "done",
          `Saved ${saveData.rowsAdded} row(s) as ${saveData.arNumber} for ${order.customer_suggested}`
        );
      } catch (err) {
        setResult(photo.id, "error", err instanceof Error ? err.message : String(err));
      }
    }

    setProcessing(false);
  }

  const doneCount = Object.values(results).filter((r) => r.status === "done").length;
  const errorCount = Object.values(results).filter((r) => r.status === "error").length;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Batch Import</h1>
        <Link href="/" style={{ fontSize: 13, color: "#555" }}>
          ← Back to scanner
        </Link>
      </div>

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
        No verification screen here — each photo is read and saved automatically, using the AI&apos;s best guess
        for customer, items, and item codes. Use this only for quickly backfilling old slips; use the normal
        scanner for anything you want to check first.
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFilesSelected}
        style={{ display: "none" }}
      />
      <button onClick={() => inputRef.current?.click()} disabled={processing} style={buttonStyle}>
        Add Photos
      </button>

      {photos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {photos.map((photo) => {
            const result = results[photo.id];
            return (
              <div
                key={photo.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.dataUrl}
                  alt="Queued slip"
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                />
                <div style={{ flex: 1, fontSize: 12 }}>
                  {result ? (
                    <span style={{ color: result.status === "error" ? "#b00020" : result.status === "done" ? "#0a7a2f" : "#555" }}>
                      {result.status === "processing" && <Spinner />}
                      {result.message}
                    </span>
                  ) : (
                    <span style={{ color: "#999" }}>Queued</span>
                  )}
                </div>
                {!processing && !result && (
                  <button onClick={() => removePhoto(photo.id)} style={deleteButtonStyle}>
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {photos.length > 0 && (
        <button onClick={handleProcessAll} disabled={processing} style={{ ...buttonStyle, background: "#171717" }}>
          {processing && <Spinner />}
          {processing ? "Processing…" : `Process All (${photos.length})`}
        </button>
      )}

      {(doneCount > 0 || errorCount > 0) && !processing && (
        <p style={{ fontSize: 13, color: "#555" }}>
          {doneCount} saved, {errorCount} failed.
        </p>
      )}
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "14px 20px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid #333",
  background: "#fff",
  color: "#171717",
  cursor: "pointer",
};

const deleteButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #b00020",
  background: "#fff",
  color: "#b00020",
  cursor: "pointer",
  flexShrink: 0,
};
