"use client";

import { useRef, useState } from "react";
import type { OrderSlipExtraction } from "@/lib/extractSchema";

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<OrderSlipExtraction | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("idle");
    setError(null);
    setExtraction(null);

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

      {extraction && (
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
          {JSON.stringify(extraction, null, 2)}
        </pre>
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
