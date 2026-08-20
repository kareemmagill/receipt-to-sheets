"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PendingUpload } from "@/lib/pendingUploads";
import { usePageTitle } from "@/lib/usePageTitle";
import { savePendingUploadHandoff } from "@/lib/pendingUploadHandoff";

// Just a count + one button, not a thumbnail per row -- with a real
// backlog (92 slips at the time of this change) a full list is more
// scrolling than useful (Kareem, 2026-08-20: "no need to show the
// thumbrint of all, just say, xx slips to be processed, take one").
// "Take One" hands the oldest queued photo off to the scanner page (via
// lib/pendingUploadHandoff.ts) so it runs through the exact same
// extract/verify/save flow as a live scan, not a second copy of that
// logic.
export default function ProcessQueuePage() {
  usePageTitle("Process Queue");
  const router = useRouter();
  const [uploads, setUploads] = useState<PendingUpload[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);

  function fetchList() {
    fetch("/api/pending-uploads")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error ?? "Unknown error");
          setStatus("error");
          return;
        }
        setUploads(data.uploads);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
  }

  function handleRetry() {
    setStatus("loading");
    setError(null);
    fetchList();
  }

  // Runs once on mount only -- no synchronous setState in the effect body
  // itself (status already starts at "loading"), same pattern as
  // app/daily-report/page.tsx's mount effect.
  useEffect(() => {
    fetchList();
  }, []);

  async function handleTakeOne() {
    if (!uploads || uploads.length === 0) return;
    const oldest = uploads[0]; // listPendingUploads returns oldest-first
    setTaking(true);
    setError(null);
    try {
      const res = await fetch(`/api/pending-uploads/photo?rowNumber=${oldest.rowNumber}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Couldn't load this photo");
        setTaking(false);
        return;
      }
      savePendingUploadHandoff({ rowNumber: oldest.rowNumber, imageDataUrl: data.imageDataUrl });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTaking(false);
    }
  }

  return (
    <main style={{ width: "100%", maxWidth: 480, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Process Queue</h1>
        <Link href="/" style={{ fontSize: 13, color: "#555" }}>
          ← Back to scanner
        </Link>
      </div>

      <p style={{ fontSize: 12, color: "#777", margin: 0 }}>
        Photos uploaded from the <Link href="/upload-slips" style={{ color: "#555" }}>Upload Slips</Link> page,
        waiting to be read and saved. Taking one opens it in the normal scanner flow.
      </p>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <p style={{ color: "#b00020" }}>Error: {error}</p>
          <button onClick={handleRetry} style={inputStyle}>
            Retry
          </button>
        </div>
      )}

      {status === "ready" && uploads && uploads.length === 0 && (
        <p style={{ fontSize: 13, color: "#777" }}>Nothing queued.</p>
      )}

      {status === "ready" && uploads && uploads.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <p style={{ fontSize: 15, margin: 0 }}>
            {uploads.length} slip{uploads.length === 1 ? "" : "s"} to be processed.
          </p>
          {error && <p style={{ color: "#b00020", fontSize: 13, margin: 0 }}>{error}</p>}
          <button onClick={handleTakeOne} disabled={taking} style={buttonStyle}>
            {taking ? "Loading…" : "Take One"}
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

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid #ccc",
  color: "#111",
  background: "#fff",
  alignSelf: "flex-start",
};
