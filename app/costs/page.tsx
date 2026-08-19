"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApiUsageSummary } from "@/lib/apiUsageLog";
import { USD_TO_PHP_RATE, HOSTING_COST_PHP_PER_MONTH, PROJECTED_MONTHLY_SLIPS, DEVELOPMENT_COST_PHP } from "@/lib/apiCost";
import { usePageTitle } from "@/lib/usePageTitle";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Plain-English purpose per endpoint, not per model name -- stays correct
// automatically when the model behind an endpoint changes (Kareem,
// 2026-08-19: "i will change to Haiku later"), without a model->purpose
// map that would need updating by hand.
function describeEndpoints(endpoints: string[]): string {
  if (endpoints.length === 0) return "Not used yet";
  return endpoints
    .map((e) => {
      if (e === "extract") return "Reading slip photos (OCR)";
      if (e === "query") return "Ask the Sales Data";
      return e;
    })
    .join(" + ");
}

export default function CostsPage() {
  usePageTitle("Costs");
  const [usage, setUsage] = useState<ApiUsageSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/usage-total")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error ?? "Unknown error");
          setStatus("error");
          return;
        }
        setUsage({ totalCostUsd: data.totalCostUsd, scanCount: data.scanCount, scanCostUsd: data.scanCostUsd, byModel: data.byModel });
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
  }, []);

  const perScanUsd = usage && usage.scanCount > 0 ? usage.scanCostUsd / usage.scanCount : null;
  const projectedAiPhp = perScanUsd !== null ? perScanUsd * PROJECTED_MONTHLY_SLIPS * USD_TO_PHP_RATE : null;
  const projectedTotalPhp = projectedAiPhp !== null ? projectedAiPhp + HOSTING_COST_PHP_PER_MONTH : null;

  return (
    <main
      style={{ width: "100%", maxWidth: 560, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 24 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Costs</h1>
        <Link href="/" style={{ fontSize: 13, color: "#555" }}>
          ← Back to scanner
        </Link>
      </div>

      {status === "loading" && <p style={{ color: "#555" }}>Loading…</p>}
      {status === "error" && <p style={{ color: "#b00020" }}>Error: {error}</p>}

      {status === "ready" && usage && (
        <>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Usage So Far</h2>
            <p style={{ fontSize: 13, color: "#555", margin: 0 }}>
              Estimated from actual token usage per call, not a pull from Anthropic&apos;s real invoiced numbers -- see{" "}
              <code>lib/apiCost.ts</code>.
            </p>

            {usage.byModel.length === 0 ? (
              <p style={{ fontSize: 13, color: "#777", margin: 0 }}>No usage logged yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {usage.byModel.map((m) => (
                  <div key={m.model} style={rowStyle}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{m.model}</div>
                      <div style={{ fontSize: 12, color: "#777" }}>
                        {describeEndpoints(m.endpoints)} · {m.callCount} call{m.callCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>₱{formatMoney(m.costUsd * USD_TO_PHP_RATE)}</div>
                  </div>
                ))}
                <div style={totalRowStyle}>
                  <span>Total</span>
                  <span>₱{formatMoney(usage.totalCostUsd * USD_TO_PHP_RATE)}</span>
                </div>
              </div>
            )}

            {usage.scanCount > 0 && (
              <p style={{ fontSize: 13, color: "#777", margin: 0 }}>
                {usage.scanCount} slip{usage.scanCount === 1 ? "" : "s"} scanned, ₱
                {formatMoney((usage.scanCostUsd / usage.scanCount) * USD_TO_PHP_RATE)}/scan average.
              </p>
            )}
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Hosting</h2>
            <div style={rowStyle}>
              <span style={{ fontSize: 13, color: "#555" }}>Vercel (Hobby) + Google Sheets/Drive APIs</span>
              <span style={{ fontWeight: 600 }}>₱{formatMoney(HOSTING_COST_PHP_PER_MONTH)}/month</span>
            </div>
            <p style={{ fontSize: 12, color: "#999", margin: 0 }}>Free at this app&apos;s current volume.</p>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Development</h2>
            <div style={rowStyle}>
              <span style={{ fontSize: 13, color: "#555" }}>Claude Code usage building this app (one-time)</span>
              <span style={{ fontWeight: 600 }}>
                {DEVELOPMENT_COST_PHP !== null ? `₱${formatMoney(DEVELOPMENT_COST_PHP)}` : "Not recorded yet"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#999", margin: 0 }}>
              A sunk cost, separate from the app&apos;s ongoing runtime spend above -- not included in the monthly projection below.
            </p>
          </section>

          <section
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              background: "#f4f4f4",
              borderRadius: 8,
              padding: "14px 16px",
            }}
          >
            <h2 style={{ fontSize: 16, margin: 0 }}>Projected Monthly Cost</h2>
            <p style={{ fontSize: 12, color: "#777", margin: 0 }}>
              At {PROJECTED_MONTHLY_SLIPS} slips/month, using today&apos;s measured cost per scan and today&apos;s AI model(s) --
              not a forecast of future model choices or pricing.
            </p>

            {projectedTotalPhp === null ? (
              <p style={{ fontSize: 13, color: "#777", margin: 0 }}>Not enough scan data yet to project a per-scan average.</p>
            ) : (
              <>
                <div style={rowStyle}>
                  <span style={{ fontSize: 13, color: "#555" }}>AI ({PROJECTED_MONTHLY_SLIPS} scans)</span>
                  <span style={{ fontWeight: 600 }}>₱{formatMoney(projectedAiPhp!)}</span>
                </div>
                <div style={rowStyle}>
                  <span style={{ fontSize: 13, color: "#555" }}>Hosting</span>
                  <span style={{ fontWeight: 600 }}>₱{formatMoney(HOSTING_COST_PHP_PER_MONTH)}</span>
                </div>
                <div style={{ ...totalRowStyle, fontSize: 18 }}>
                  <span>Total / month</span>
                  <span>₱{formatMoney(projectedTotalPhp)}</span>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const totalRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontWeight: 700,
  borderTop: "1px solid #ddd",
  paddingTop: 6,
};
