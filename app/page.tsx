"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OrderSlipExtraction } from "@/lib/extractSchema";
import VerificationForm, { type EditableOrder } from "@/components/VerificationForm";
import { loadLastPhoto, saveLastPhoto } from "@/lib/lastPhotoStore";
import { resizeForVisionApi } from "@/lib/resizeImage";

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [lastImageDataUrl, setLastImageDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<OrderSlipExtraction | null>(null);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error" | "duplicate" | "conflict">(
    "idle"
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictDifferences, setConflictDifferences] = useState<string[]>([]);
  const [pendingOrder, setPendingOrder] = useState<EditableOrder | null>(null);
  const [rowsAdded, setRowsAdded] = useState(0);
  const [savedArNumber, setSavedArNumber] = useState("");
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);

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
    setConflictDifferences([]);

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
    setConflictDifferences([]);
    setImageDataUrl(lastImageDataUrl);
  }

  async function handleProcess() {
    if (!imageDataUrl) return;
    setStatus("loading");
    setError(null);
    setExtraction(null);

    try {
      const resizedForApi = await resizeForVisionApi(imageDataUrl);
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
    setConflictDifferences([]);
    setPendingOrder(null);
    setPhotoWarning(null);
    setImageDataUrl(null);
  }

  async function handleConfirm(order: EditableOrder, force = false) {
    setSaveStatus("saving");
    setSaveError(null);
    setConflictDifferences([]);
    setPendingOrder(order);

    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, force, imageDataUrl }),
      });
      const data = await res.json();

      if (data.duplicate) {
        setSaveError(data.error ?? "Already recorded");
        setSaveStatus("duplicate");
        return;
      }
      if (data.conflict) {
        setSaveError(data.error ?? "Slip number already exists with different data");
        setConflictDifferences(data.differences ?? []);
        setSaveStatus("conflict");
        return;
      }
      if (!data.ok) {
        setSaveError(data.error ?? "Unknown error");
        setSaveStatus("error");
        return;
      }

      setRowsAdded(data.rowsAdded);
      setSavedArNumber(data.arNumber);
      setPhotoWarning(data.photoWarning ?? null);
      setSaveStatus("success");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaveStatus("error");
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

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => inputRef.current?.click()} style={{ ...buttonStyle, flex: 1 }}>
              {imageDataUrl ? "Retake Photo" : "Take Photo"}
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
              {status === "loading" ? "Reading slip…" : "Process Order Slip"}
            </button>
          )}

          {error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
        </>
      )}

      {extraction && saveStatus !== "success" && saveStatus !== "duplicate" && (
        <>
          {saveStatus === "error" && <p style={{ color: "#b00020" }}>Save failed: {saveError}</p>}
          {saveStatus === "conflict" && (
            <div
              style={{
                background: "#fdecea",
                border: "1px solid #d32f2f",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                color: "#7a1f1f",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <strong>{saveError}</strong>
              {conflictDifferences.length > 0 && (
                <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
                  {conflictDifferences.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
              <span>Fix the fields below to match, or save anyway if this is genuinely a different order.</span>
              <button
                onClick={() => pendingOrder && handleConfirm(pendingOrder, true)}
                style={{ ...buttonStyle, background: "#d32f2f", alignSelf: "flex-start" }}
              >
                Save Anyway
              </button>
            </div>
          )}
          <VerificationForm
            extraction={extraction}
            onConfirm={(order) => handleConfirm(order)}
            onRetake={handleRetake}
            saving={saveStatus === "saving"}
          />
        </>
      )}

      {saveStatus === "duplicate" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "#555" }}>{saveError}</p>
          <button onClick={handleRetake} style={buttonStyle}>
            Scan Another Slip
          </button>
        </div>
      )}

      {saveStatus === "success" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "#0a7a2f" }}>
            Saved {rowsAdded} row{rowsAdded === 1 ? "" : "s"} to Sales Orders as {savedArNumber}.
          </p>
          {photoWarning && (
            <p style={{ color: "#8a6d00", fontSize: 12 }}>Photo not archived: {photoWarning}</p>
          )}
          <button onClick={handleRetake} style={buttonStyle}>
            Scan Another Slip
          </button>
        </div>
      )}
    </main>
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
