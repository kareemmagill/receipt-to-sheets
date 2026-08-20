"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ExistingOrderSummary } from "@/lib/duplicateCheck";
import { usePageTitle } from "@/lib/usePageTitle";
import { saveProblemRecordHandoff } from "@/lib/problemRecordHandoff";

// Lists every saved slip with at least one item still flagged via the
// verification form's Problem button (Kareem, 2026-08-20: "flag this
// record for extra scrutiny... add a 'Review Problem Records' button that
// opens these. from there the user can edit and approve the slip").
// "Open" hands the slip off to the normal scanner edit flow (via
// lib/problemRecordHandoff.ts) so resolving it reuses the exact same
// edit/verify/save machinery as everything else, not a second copy.
export default function ReviewProblemsPage() {
  usePageTitle("Review Problem Records");
  const router = useRouter();
  const [slips, setSlips] = useState<ExistingOrderSummary[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [openingSlip, setOpeningSlip] = useState<string | null>(null);

  function fetchList() {
    fetch("/api/problem-records")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error ?? "Unknown error");
          setStatus("error");
          return;
        }
        setSlips(data.slips);
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

  useEffect(() => {
    fetchList();
  }, []);

  async function handleOpen(slip: ExistingOrderSummary) {
    setOpeningSlip(slip.slipNumber);
    setError(null);
    try {
      const res = await fetch(
        `/api/problem-records/load?slipNumber=${encodeURIComponent(slip.slipNumber)}&slipType=${encodeURIComponent(slip.slipType)}`
      );
      const data = await res.json();
      if (!data.ok || !data.order) {
        setError(data.error ?? "Couldn't load this slip");
        setOpeningSlip(null);
        return;
      }
      saveProblemRecordHandoff({
        order: data.order,
        extraction: data.extraction,
        itemTemplate: data.itemTemplate ?? [],
        imageDataUrl: data.imageDataUrl ?? null,
      });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOpeningSlip(null);
    }
  }

  const problemItemCount = (slip: ExistingOrderSummary) => slip.items.filter((item) => item.problem).length;

  return (
    <main style={{ width: "100%", maxWidth: 480, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Review Problem Records</h1>
        <Link href="/" style={{ fontSize: 13, color: "#555" }}>
          ← Back to scanner
        </Link>
      </div>

      <p style={{ fontSize: 12, color: "#777", margin: 0 }}>
        Saved slips with at least one item flagged for extra scrutiny. Opening one lets you edit it and, once every
        Problem flag is cleared and saved, it drops off this list.
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

      {status === "ready" && slips && slips.length === 0 && (
        <p style={{ fontSize: 13, color: "#777" }}>Nothing flagged.</p>
      )}

      {status === "ready" && slips && slips.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {error && <p style={{ color: "#b00020", fontSize: 13, margin: 0 }}>{error}</p>}
          {slips.map((slip) => (
            <div
              key={`${slip.slipType}-${slip.slipNumber}`}
              style={{ border: "1px solid #b00020", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <strong style={{ fontSize: 15 }}>#{slip.slipNumber}</strong>
                <span style={{ fontSize: 12, color: "#b00020" }}>
                  ❓ {problemItemCount(slip)} item{problemItemCount(slip) === 1 ? "" : "s"} flagged
                </span>
              </div>
              <span style={{ fontSize: 13 }}>
                {slip.customer || "(no customer)"} — {slip.date || "no date"}
              </span>
              <button
                onClick={() => handleOpen(slip)}
                disabled={openingSlip === slip.slipNumber}
                style={buttonStyle}
              >
                {openingSlip === slip.slipNumber ? "Loading…" : "Open"}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: 15,
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
