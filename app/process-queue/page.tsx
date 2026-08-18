"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PendingUpload } from "@/lib/pendingUploads";
import { usePageTitle } from "@/lib/usePageTitle";
import { savePendingUploadHandoff } from "@/lib/pendingUploadHandoff";

function formatUploadedAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
}

// Lists every photo queued by app/upload-slips/page.tsx and lets staff
// work through them one at a time -- "Process" hands the photo off to the
// scanner page (via lib/pendingUploadHandoff.ts) so it runs through the
// exact same extract/verify/save flow as a live scan, not a second copy
// of that logic (Kareem, 2026-08-20).
export default function ProcessQueuePage() {
  usePageTitle("Process Queue");
  const router = useRouter();
  const [uploads, setUploads] = useState<PendingUpload[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  // rowNumber of whichever entry is currently being fetched from Drive --
  // disables every "Process" button, not just the clicked one, since
  // there's only one scanner page to hand off to at a time.
  const [loadingRow, setLoadingRow] = useState<number | null>(null);

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

  async function handleProcess(rowNumber: number) {
    setLoadingRow(rowNumber);
    try {
      const res = await fetch(`/api/pending-uploads/photo?rowNumber=${rowNumber}`);
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Couldn't load this photo");
        setLoadingRow(null);
        return;
      }
      savePendingUploadHandoff({ rowNumber, imageDataUrl: data.imageDataUrl });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoadingRow(null);
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
        waiting to be read and saved. Processing one opens it in the normal scanner flow.
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {uploads.map((u) => (
            <div
              key={u.rowNumber}
              style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid #ddd", borderRadius: 8, padding: 8 }}
            >
              {u.photoThumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.photoThumbnailUrl}
                  alt="Queued slip"
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 6, background: "#eee", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, fontSize: 12, color: "#555" }}>
                {u.uploadedBy && <div>By {u.uploadedBy}</div>}
                <div>{u.uploadedAt ? formatUploadedAt(u.uploadedAt) : ""}</div>
              </div>
              <button
                onClick={() => handleProcess(u.rowNumber)}
                disabled={loadingRow !== null}
                style={buttonStyle}
              >
                {loadingRow === u.rowNumber ? "Loading…" : "Process"}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #333",
  background: "#171717",
  color: "#fff",
  cursor: "pointer",
  flexShrink: 0,
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
