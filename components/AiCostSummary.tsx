"use client";

import { useState } from "react";
import type { ApiUsageSummary } from "@/lib/apiUsageLog";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Plain-English purpose per endpoint, not per model name -- so the label
// stays correct automatically when the model behind an endpoint changes
// (Kareem, 2026-08-19: "i will change to Haiku later"), without needing a
// model->purpose map updated by hand.
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

// Headline is scan-cost only ("AI Cost: ₱X for N slips, ₱Y/scan") -- click
// to expand into a per-model breakdown (grows on its own as new model
// names show up in the log, e.g. once/if extraction switches models) with
// a layman explanation of what each model is actually used for, plus the
// grand total across every endpoint (Kareem, 2026-08-19).
export function AiCostSummary({ usage, phpRate }: { usage: ApiUsageSummary; phpRate: number }) {
  const [expanded, setExpanded] = useState(false);

  if (usage.scanCount === 0) return null; // nothing scanned yet -- nothing meaningful to show

  const perScanPhp = (usage.scanCostUsd / usage.scanCount) * phpRate;

  return (
    <div>
      <button type="button" onClick={() => setExpanded((v) => !v)} style={headlineButtonStyle}>
        <span>
          AI Cost: ₱{formatMoney(usage.scanCostUsd * phpRate)} for {usage.scanCount} slip{usage.scanCount === 1 ? "" : "s"}, ₱
          {formatMoney(perScanPhp)}/scan
        </span>
        <span style={{ fontSize: 11, color: "#999" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={panelStyle}>
          {usage.byModel.map((m) => (
            <div key={m.model} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 600 }}>{m.model}</div>
                <div style={{ fontSize: 11, color: "#777" }}>
                  {describeEndpoints(m.endpoints)} · {m.callCount} call{m.callCount === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>₱{formatMoney(m.costUsd * phpRate)}</div>
            </div>
          ))}
          <div style={totalRowStyle}>
            <span>Total</span>
            <span>₱{formatMoney(usage.totalCostUsd * phpRate)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const headlineButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: 0,
  border: "none",
  background: "none",
  cursor: "pointer",
  font: "inherit",
  fontSize: 15,
  color: "#999",
};

const panelStyle: React.CSSProperties = {
  marginTop: 8,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  background: "#f7f7f7",
  border: "1px solid #eee",
  borderRadius: 8,
  padding: "10px 12px",
};

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
