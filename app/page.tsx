"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { OrderSlipExtraction } from "@/lib/extractSchema";
import VerificationForm, { type EditableOrder } from "@/components/VerificationForm";

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<OrderSlipExtraction | null>(null);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rowsAdded, setRowsAdded] = useState(0);
  const [savedArNumber, setSavedArNumber] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("idle");
    setError(null);
    setExtraction(null);
    setSaveStatus("idle");
    setSaveError(null);

    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleProcess() {
    if (!imageDataUrl) return;
    setStatus("loading");
    setError(null);
    setExtraction(null);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
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
    setImageDataUrl(null);
  }

  async function handleConfirm(order: EditableOrder) {
    setSaveStatus("saving");
    setSaveError(null);

    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      const data = await res.json();

      if (!data.ok) {
        setSaveError(data.error ?? "Unknown error");
        setSaveStatus("error");
        return;
      }

      setRowsAdded(data.rowsAdded);
      setSavedArNumber(data.arNumber);
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

          <button onClick={() => inputRef.current?.click()} style={buttonStyle}>
            {imageDataUrl ? "Retake Photo" : "Take Photo"}
          </button>

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

      {extraction && saveStatus !== "success" && (
        <>
          {saveStatus === "error" && <p style={{ color: "#b00020" }}>Save failed: {saveError}</p>}
          <VerificationForm
            extraction={extraction}
            onConfirm={handleConfirm}
            onRetake={handleRetake}
            saving={saveStatus === "saving"}
          />
        </>
      )}

      {saveStatus === "success" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "#0a7a2f" }}>
            Saved {rowsAdded} row{rowsAdded === 1 ? "" : "s"} to Sales Orders as {savedArNumber}.
          </p>
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
