"use client";

import { useRef, useState } from "react";
import type { OrderSlipExtraction } from "@/lib/extractSchema";
import VerificationForm, { type EditableOrder } from "@/components/VerificationForm";

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<OrderSlipExtraction | null>(null);
  const [savedOrder, setSavedOrder] = useState<EditableOrder | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("idle");
    setError(null);
    setExtraction(null);
    setSavedOrder(null);

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
    setSavedOrder(null);
    setImageDataUrl(null);
  }

  function handleConfirm(order: EditableOrder) {
    // Phase 9 will write this to the Sales Orders tab. For now, prove the
    // data shape is right before wiring up the real save.
    setSavedOrder(order);
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
      <h1 style={{ fontSize: 20 }}>PGYC Order Slip Scanner</h1>

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

      {extraction && !savedOrder && (
        <VerificationForm extraction={extraction} onConfirm={handleConfirm} onRetake={handleRetake} />
      )}

      {savedOrder && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "#0a7a2f" }}>
            Confirmed. Saving to Sales Orders comes in Phase 9 — here&apos;s what would be sent:
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#f4f4f4",
              color: "#111",
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            {JSON.stringify(savedOrder, null, 2)}
          </pre>
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
