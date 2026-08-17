"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DailyReport, DailyReportBucket } from "@/lib/dailyReport";
import type { PhotoLinkInfo } from "@/lib/photoLog";
import { usePageTitle } from "@/lib/usePageTitle";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

interface DailyReportResponse {
  ok: boolean;
  report?: DailyReport;
  error?: string;
}

// date omitted -> server resolves the default (yesterday if it has
// records, else today, else the most recent record day -- see
// lib/dailyReport.ts's resolveDefaultDateKey).
function fetchDailyReport(date?: string): Promise<DailyReportResponse> {
  const url = date ? `/api/daily-report?date=${date}` : "/api/daily-report";
  return fetch(url).then((res) => res.json());
}

export default function DailyReportPage() {
  usePageTitle("Daily Sales Report");
  const [dateKey, setDateKey] = useState("");
  const [report, setReport] = useState<DailyReport | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  // Which slip number's photo is currently shown in the inline viewer --
  // opening it never navigates away from this page (Kareem, 2026-08-17).
  const [viewingSlip, setViewingSlip] = useState<string | null>(null);
  const [failedPhotoSlip, setFailedPhotoSlip] = useState<string | null>(null);

  function applyResponse(data: DailyReportResponse) {
    if (!data.ok || !data.report) {
      setError(data.error ?? "Unknown error");
      setStatus("error");
      return;
    }
    setReport(data.report);
    setDateKey(data.report.dateKey);
    setStatus("ready");
  }

  function handleFetchError(err: unknown) {
    setError(err instanceof Error ? err.message : String(err));
    setStatus("error");
  }

  useEffect(() => {
    // Runs once on mount only -- lets the server pick the default date.
    fetchDailyReport().then(applyResponse).catch(handleFetchError);
  }, []);

  function handleDateChange(newDate: string) {
    setStatus("loading");
    setError(null);
    setViewingSlip(null);
    setFailedPhotoSlip(null);
    fetchDailyReport(newDate).then(applyResponse).catch(handleFetchError);
  }

  function handleRetry() {
    setStatus("loading");
    setError(null);
    fetchDailyReport(dateKey || undefined).then(applyResponse).catch(handleFetchError);
  }

  return (
    <main
      style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 20 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Daily Sales Report</h1>
        <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
          <Link href="/" style={{ color: "#555" }}>
            ← Back to scanner
          </Link>
        </div>
      </div>

      <input type="date" value={dateKey} onChange={(e) => handleDateChange(e.target.value)} style={inputStyle} />

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <p style={{ color: "#b00020" }}>Error: {error}</p>
          <button onClick={handleRetry} style={inputStyle}>
            Retry
          </button>
        </div>
      )}

      {status === "ready" && report && (
        <>
          <h2 style={{ fontSize: 16, margin: 0, color: "#555" }}>{formatDateHeading(report.dateKey)}</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <SummaryCard label="Members Paid" amount={report.membersPaid.total} />
            <SummaryCard label="Non-Members Paid" amount={report.nonMembersPaid.total} />
            <SummaryCard label="Members Not Paid" amount={report.membersNotPaid.total} color="#b00020" />
            <SummaryCard label="Total Sales" amount={report.totalSales} emphasize />
          </div>

          {report.nonMembersNotPaid.lines.length > 0 && (
            <div style={{ background: "#fdecea", border: "1px solid #b00020", borderRadius: 8, padding: 12 }}>
              <p style={{ color: "#b00020", fontWeight: 600, margin: "0 0 8px 0", fontSize: 13 }}>
                ⚠ Non-Member(s) marked Not Paid -- shouldn&apos;t happen going forward, needs a look
              </p>
              <DetailTable bucket={report.nonMembersNotPaid} photos={report.photos} onViewPhoto={setViewingSlip} />
            </div>
          )}

          <DetailSection
            title="Members Not Paid"
            bucket={report.membersNotPaid}
            photos={report.photos}
            onViewPhoto={setViewingSlip}
          />
          <DetailSection
            title="Members Paid"
            bucket={report.membersPaid}
            photos={report.photos}
            onViewPhoto={setViewingSlip}
          />
          <DetailSection
            title="Non-Members Paid"
            bucket={report.nonMembersPaid}
            photos={report.photos}
            onViewPhoto={setViewingSlip}
          />
        </>
      )}

      {viewingSlip && report?.photos[viewingSlip] && (
        <div
          onClick={() => setViewingSlip(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", maxWidth: 600 }}>
            <span style={{ color: "#fff", fontSize: 14 }}>Slip #{viewingSlip}</span>
            <button type="button" onClick={() => setViewingSlip(null)} style={closeButtonStyle}>
              Close
            </button>
          </div>

          {report.photos[viewingSlip].photoThumbnailUrl && failedPhotoSlip !== viewingSlip ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={report.photos[viewingSlip].photoThumbnailUrl}
              alt={`Slip #${viewingSlip}`}
              onClick={(e) => e.stopPropagation()}
              onError={() => setFailedPhotoSlip(viewingSlip)}
              style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 8 }}
            />
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}
            >
              <p style={{ margin: 0, fontSize: 13 }}>Couldn&apos;t load a preview.</p>
              <a href={report.photos[viewingSlip].photoLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                Open in Google Drive
              </a>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  amount,
  color,
  emphasize,
}: {
  label: string;
  amount: number;
  color?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      style={{
        background: "#f4f4f4",
        borderRadius: 8,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span style={{ fontSize: 12, color: "#777" }}>{label}</span>
      <span style={{ fontSize: emphasize ? 24 : 18, fontWeight: 700, color: color ?? "#171717" }}>
        {formatMoney(amount)}
      </span>
    </div>
  );
}

function DetailSection({
  title,
  bucket,
  photos,
  onViewPhoto,
}: {
  title: string;
  bucket: DailyReportBucket;
  photos: Record<string, PhotoLinkInfo>;
  onViewPhoto: (slipNumber: string) => void;
}) {
  return (
    <section>
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>{title}</h2>
      <DetailTable bucket={bucket} photos={photos} onViewPhoto={onViewPhoto} />
    </section>
  );
}

function DetailTable({
  bucket,
  photos,
  onViewPhoto,
}: {
  bucket: DailyReportBucket;
  photos: Record<string, PhotoLinkInfo>;
  onViewPhoto: (slipNumber: string) => void;
}) {
  return (
    <div style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Slip Number(s)</th>
            <th style={thStyle}>Name</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Total Amount</th>
          </tr>
        </thead>
        <tbody>
          {bucket.lines.map((l) => (
            <tr key={l.customer}>
              <td style={tdStyle}>
                {l.slipNumbers.map((sn, i) => (
                  <span key={sn}>
                    {i > 0 && ", "}
                    {photos[sn] ? (
                      <button type="button" onClick={() => onViewPhoto(sn)} style={slipLinkStyle}>
                        {sn}
                      </button>
                    ) : (
                      sn
                    )}
                  </span>
                ))}
              </td>
              <td style={tdStyle}>{l.customer}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{formatMoney(l.total)}</td>
            </tr>
          ))}
          {bucket.lines.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={3}>
                No data.
              </td>
            </tr>
          )}
        </tbody>
        {bucket.lines.length > 0 && (
          <tfoot>
            <tr>
              <td style={{ ...tdStyle, fontWeight: 600, borderBottom: "none" }} colSpan={2}>
                Total
              </td>
              <td style={{ ...tdStyle, fontWeight: 600, textAlign: "right", borderBottom: "none" }}>
                {formatMoney(bucket.total)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// color/background explicit -- see the comment on VerificationForm's
// inputStyle for why (dark-mode text was inheriting onto a white box).
const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid #ccc",
  color: "#111",
  background: "#fff",
  alignSelf: "flex-start",
};

const slipLinkStyle: React.CSSProperties = {
  padding: 0,
  border: "none",
  background: "none",
  color: "#1a73e8",
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
};

const closeButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #fff",
  background: "none",
  color: "#fff",
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "2px solid #ccc",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #eee",
};
