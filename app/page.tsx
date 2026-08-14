"use client";

import { useRef, useState } from "react";

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setReady(false);

    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleProcess() {
    // Phase 6 will POST imageDataUrl to /api/extract for AI vision processing.
    setReady(true);
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
        <button onClick={handleProcess} style={buttonStyle}>
          Process Order Slip
        </button>
      )}

      {ready && imageDataUrl && (
        <p style={{ color: "#0a7a2f" }}>
          Photo captured ({fileName}, ~{Math.round(imageDataUrl.length / 1024)} KB). AI
          processing comes in Phase 6.
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
  background: "#171717",
  color: "#fff",
  cursor: "pointer",
};
