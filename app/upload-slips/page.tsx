"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { makeId } from "@/lib/makeId";
import { resizeImage } from "@/lib/resizeImage";
import { Spinner } from "@/components/Spinner";
import { getDeviceLabel } from "@/lib/deviceId";
import { getStoredUserName } from "@/lib/userName";
import { usePageTitle } from "@/lib/usePageTitle";

interface QueuedPhoto {
  id: string;
  dataUrl: string;
}

type UploadStatus = "pending" | "uploading" | "done" | "error";
interface UploadResult {
  status: UploadStatus;
  message: string;
}

// How many photos upload to Drive at once. The Drive upload itself has no
// shared state so any number is safe, but the sheet-row append behind it
// isn't safe to run concurrently (see app/api/pending-uploads/upload-
// photo/route.ts's comment) -- kept modest so a big batch doesn't also
// spike memory (each in-flight upload holds its resized image in memory)
// or make one slow upload block noticeably more of the batch behind it.
const UPLOAD_CONCURRENCY = 3;

// Lets staff snap/select a batch of slip photos and get them safely into
// Drive right away, without reading or reviewing any of them yet -- the
// actual digitizing happens later, from the queue this creates (see
// app/process-queue/page.tsx and lib/pendingUploads.ts). Unlike
// app/batch/page.tsx (which reads + saves each photo immediately, no
// review), this page never calls /api/extract at all (Kareem, 2026-08-20:
// "add a page for staff to upload a bunch of pictures for processing
// later").
export default function UploadSlipsPage() {
  usePageTitle("Upload Slips");
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [results, setResults] = useState<Record<string, UploadResult>>({});
  const [uploading, setUploading] = useState(false);

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

  function setResult(id: string, status: UploadStatus, message: string) {
    setResults((prev) => ({ ...prev, [id]: { status, message } }));
  }

  async function handleUploadAll() {
    setUploading(true);

    // The Drive upload (slow, network-bound) runs up to UPLOAD_CONCURRENCY
    // at once via the worker pool below. The sheet-row append behind it
    // does not -- appendRows reads the tab's current length then writes at
    // that computed row (see lib/googleSheets.ts), so concurrent appends
    // could compute the same "next row" and one would silently overwrite
    // the other. Chaining every append onto this one promise forces them
    // to run strictly one at a time regardless of upload order (Kareem,
    // 2026-08-20: "if parallel uploading is possible then use it").
    let appendChain: Promise<void> = Promise.resolve();

    async function processOne(photo: QueuedPhoto) {
      setResult(photo.id, "uploading", "Uploading…");

      let photoLink: string;
      try {
        // Same cap /api/extract's own OCR-read copy uses -- this photo IS
        // the eventual OCR source (there's no separate live-camera frame
        // kept around like the normal scan flow has), so it needs to stay
        // at OCR quality, not the lower archival-only cap used once a
        // slip's already been read.
        const resized = await resizeImage(photo.dataUrl);
        const res = await fetch("/api/pending-uploads/upload-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: resized }),
        });
        const data = await res.json();
        if (!data.ok) {
          setResult(photo.id, "error", data.error ?? "Upload failed");
          return;
        }
        photoLink = data.photoLink;
      } catch (err) {
        setResult(photo.id, "error", err instanceof Error ? err.message : String(err));
        return;
      }

      appendChain = appendChain.then(async () => {
        try {
          const res = await fetch("/api/pending-uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photoLink, uploadedBy: getStoredUserName(), device: getDeviceLabel() }),
          });
          const data = await res.json();
          if (!data.ok) {
            setResult(photo.id, "error", data.error ?? "Failed to queue");
            return;
          }
          setResult(photo.id, "done", "Uploaded");
        } catch (err) {
          setResult(photo.id, "error", err instanceof Error ? err.message : String(err));
        }
      });
    }

    const queue = [...photos];
    async function worker() {
      while (queue.length > 0) {
        const photo = queue.shift();
        if (photo) await processOne(photo);
      }
    }

    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, photos.length) }, worker));
    await appendChain;

    setUploading(false);
  }

  const doneCount = Object.values(results).filter((r) => r.status === "done").length;
  const errorCount = Object.values(results).filter((r) => r.status === "error").length;
  const allDone = photos.length > 0 && doneCount + errorCount === photos.length;

  return (
    <main style={{ width: "100%", maxWidth: 480, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Upload Slips</h1>
        <Link href="/" style={{ fontSize: 13, color: "#555" }}>
          ← Back to scanner
        </Link>
      </div>

      <div
        style={{
          background: "#e8f0fe",
          border: "1px solid #1a73e8",
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 12,
          color: "#174ea6",
        }}
      >
        Just gets photos safely into Drive -- nothing here is read or saved to Sales Orders yet. Digitize them later
        from the <Link href="/process-queue" style={{ color: "#174ea6", fontWeight: 600 }}>Process Queue</Link> page.
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFilesSelected}
        style={{ display: "none" }}
      />
      <button onClick={() => inputRef.current?.click()} disabled={uploading} style={buttonStyle}>
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
                      {result.status === "uploading" && <Spinner />}
                      {result.message}
                    </span>
                  ) : (
                    <span style={{ color: "#999" }}>Queued</span>
                  )}
                </div>
                {!uploading && !result && (
                  <button onClick={() => removePhoto(photo.id)} style={deleteButtonStyle}>
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {photos.length > 0 && !allDone && (
        <button onClick={handleUploadAll} disabled={uploading} style={{ ...buttonStyle, background: "#171717", color: "#fff" }}>
          {uploading && <Spinner />}
          {uploading ? "Uploading…" : `Upload All (${photos.length})`}
        </button>
      )}

      {allDone && (
        <p style={{ fontSize: 13, color: "#555" }}>
          {doneCount} uploaded, {errorCount} failed.
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
