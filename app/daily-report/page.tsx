"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DailyReport, DailyReportBucket } from "@/lib/dailyReport";
import type { MonthlyReport, MonthlyCustomerLine, MonthlySlipDetail } from "@/lib/monthlyReport";
import type { PhotoLinkInfo } from "@/lib/photoLog";
import { usePageTitle } from "@/lib/usePageTitle";
import { DateCalendar } from "@/components/DateCalendar";
import { MonthCalendar } from "@/components/MonthCalendar";
import { SlipViewerModal } from "@/components/SlipViewerModal";
import { MemberDetailModal } from "@/components/MemberDetailModal";
import { useSlipViewer } from "@/lib/useSlipViewer";
import { useMemberDetail } from "@/lib/useMemberDetail";

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

function formatMonthHeading(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  if (!y || !m || !d) return dateKey;
  return `${d}/${m}/${y}`;
}

interface DailyReportResponse {
  ok: boolean;
  report?: DailyReport;
  error?: string;
}

interface MonthlyReportResponse {
  ok: boolean;
  report?: MonthlyReport;
  error?: string;
}

// date omitted -> server resolves the default (yesterday if it has
// records, else today, else the most recent record day -- see
// lib/dailyReport.ts's resolveDefaultDateKey).
function fetchDailyReport(date?: string): Promise<DailyReportResponse> {
  const url = date ? `/api/daily-report?date=${date}` : "/api/daily-report";
  return fetch(url).then((res) => res.json());
}

// month omitted -> server resolves the default (current month if it has
// records, else the most recent month that does -- see
// lib/monthlyReport.ts's resolveDefaultMonthKey).
function fetchMonthlyReport(month?: string): Promise<MonthlyReportResponse> {
  const url = month ? `/api/monthly-report?month=${month}` : "/api/monthly-report";
  return fetch(url).then((res) => res.json());
}

export default function DailyReportPage() {
  usePageTitle("Sales Report");
  // Daily view (default) vs. monthly view -- toggled by the two buttons at
  // the top of the page (Kareem, 2026-08-18: "toggle between the 2,
  // default is daily set to the day of the latest sales"). The monthly
  // report is only fetched the first time the user switches to it, not on
  // every page load.
  const [viewMode, setViewMode] = useState<"day" | "month">("day");

  const [dateKey, setDateKey] = useState("");
  const [report, setReport] = useState<DailyReport | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const [monthKey, setMonthKey] = useState("");
  const [monthReport, setMonthReport] = useState<MonthlyReport | null>(null);
  const [monthStatus, setMonthStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [monthError, setMonthError] = useState<string | null>(null);
  // Which customer's slip breakdown is expanded in the monthly view.
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  // Opening a slip never navigates away from this page (Kareem,
  // 2026-08-17) -- shows the saved photo alongside a digitised SlipLayout
  // recreation, the same combined presentation as the Duplicate Slip
  // screen (Kareem, 2026-08-18). Shared with Members Billing and the
  // Monthly Sales "view all sales" link, all via the same hook/component
  // (Kareem, 2026-08-20).
  const { viewingSlip, failedPhotoSlip, setFailedPhotoSlip, slipDetail, slipDetailStatus, viewSlip, closeSlip } =
    useSlipViewer();
  const { viewingMember, memberDetail, memberDetailStatus, viewMember, closeMember } = useMemberDetail();

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
    closeSlip();
    setFailedPhotoSlip(null);
    fetchDailyReport(newDate).then(applyResponse).catch(handleFetchError);
  }

  function handleRetry() {
    setStatus("loading");
    setError(null);
    fetchDailyReport(dateKey || undefined).then(applyResponse).catch(handleFetchError);
  }

  function applyMonthResponse(data: MonthlyReportResponse) {
    if (!data.ok || !data.report) {
      setMonthError(data.error ?? "Unknown error");
      setMonthStatus("error");
      return;
    }
    setMonthReport(data.report);
    setMonthKey(data.report.monthKey);
    setMonthStatus("ready");
  }

  function handleMonthFetchError(err: unknown) {
    setMonthError(err instanceof Error ? err.message : String(err));
    setMonthStatus("error");
  }

  function handleToggleView(mode: "day" | "month") {
    setViewMode(mode);
    closeSlip();
    if (mode === "month" && monthStatus === "idle") {
      setMonthStatus("loading");
      fetchMonthlyReport().then(applyMonthResponse).catch(handleMonthFetchError);
    }
  }

  function handleMonthChange(newMonth: string) {
    setMonthStatus("loading");
    setMonthError(null);
    setSelectedCustomer(null);
    closeSlip();
    fetchMonthlyReport(newMonth).then(applyMonthResponse).catch(handleMonthFetchError);
  }

  function handleMonthRetry() {
    setMonthStatus("loading");
    setMonthError(null);
    fetchMonthlyReport(monthKey || undefined).then(applyMonthResponse).catch(handleMonthFetchError);
  }

  return (
    <main
      style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 20 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Sales Report</h1>
        <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
          <Link href="/" style={{ color: "#555" }}>
            ← Back to scanner
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => handleToggleView("day")} style={toggleButtonStyle(viewMode === "day")}>
          Daily Sales
        </button>
        <button type="button" onClick={() => handleToggleView("month")} style={toggleButtonStyle(viewMode === "month")}>
          Monthly Sales
        </button>
      </div>

      {viewMode === "day" && (
        <>
          <DateCalendar
            value={dateKey}
            onChange={handleDateChange}
            salesByDate={report?.salesByDate ?? {}}
          />

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
                  <DetailTable bucket={report.nonMembersNotPaid} photos={report.photos} onViewPhoto={viewSlip} />
                </div>
              )}

              <DetailSection
                title="Members Not Paid"
                bucket={report.membersNotPaid}
                photos={report.photos}
                onViewPhoto={viewSlip}
              />
              <DetailSection
                title="Members Paid"
                bucket={report.membersPaid}
                photos={report.photos}
                onViewPhoto={viewSlip}
              />
              <DetailSection
                title="Non-Members Paid"
                bucket={report.nonMembersPaid}
                photos={report.photos}
                onViewPhoto={viewSlip}
              />
            </>
          )}
        </>
      )}

      {viewMode === "month" && (
        <>
          <MonthCalendar value={monthKey} onChange={handleMonthChange} salesByMonth={monthReport?.salesByMonth ?? {}} />

          {monthStatus === "loading" && !monthReport && <p>Loading…</p>}
          {monthStatus === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
              <p style={{ color: "#b00020" }}>Error: {monthError}</p>
              <button onClick={handleMonthRetry} style={inputStyle}>
                Retry
              </button>
            </div>
          )}

          {monthReport && (
            <>
              <h2 style={{ fontSize: 16, margin: 0, color: "#555" }}>{formatMonthHeading(monthReport.monthKey)}</h2>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                <SummaryCard label="Members Paid" amount={monthReport.membersPaid.total} />
                <SummaryCard label="Non-Members Paid" amount={monthReport.nonMembersPaid.total} />
                <SummaryCard label="Members Not Paid" amount={monthReport.membersNotPaid.total} color="#b00020" />
                <SummaryCard label="Total Sales" amount={monthReport.totalSales} emphasize />
              </div>

              {monthReport.nonMembersNotPaid.lines.length > 0 && (
                <div style={{ background: "#fdecea", border: "1px solid #b00020", borderRadius: 8, padding: 12 }}>
                  <p style={{ color: "#b00020", fontWeight: 600, margin: "0 0 8px 0", fontSize: 13 }}>
                    ⚠ Non-Member(s) marked Not Paid -- shouldn&apos;t happen going forward, needs a look
                  </p>
                  <MonthlyCustomerList
                    lines={monthReport.nonMembersNotPaid.lines}
                    slipsByCustomer={monthReport.slipsByCustomer}
                    selectedCustomer={selectedCustomer}
                    onSelectCustomer={setSelectedCustomer}
                    onViewSlip={viewSlip}
                    onViewMember={viewMember}
                  />
                </div>
              )}

              <MonthlyCustomerList
                title="Members Not Paid"
                lines={monthReport.membersNotPaid.lines}
                color="#b00020"
                slipsByCustomer={monthReport.slipsByCustomer}
                selectedCustomer={selectedCustomer}
                onSelectCustomer={setSelectedCustomer}
                onViewSlip={viewSlip}
                onViewMember={viewMember}
              />
              <MonthlyCustomerList
                title="Members Paid"
                lines={monthReport.membersPaid.lines}
                slipsByCustomer={monthReport.slipsByCustomer}
                selectedCustomer={selectedCustomer}
                onSelectCustomer={setSelectedCustomer}
                onViewSlip={viewSlip}
                onViewMember={viewMember}
              />
              <MonthlyCustomerList
                title="Non-Members Paid"
                lines={monthReport.nonMembersPaid.lines}
                slipsByCustomer={monthReport.slipsByCustomer}
                selectedCustomer={selectedCustomer}
                onSelectCustomer={setSelectedCustomer}
                onViewSlip={viewSlip}
                onViewMember={viewMember}
              />
            </>
          )}
        </>
      )}

      {viewingMember && (
        <MemberDetailModal
          memberName={viewingMember}
          detail={memberDetail}
          status={memberDetailStatus}
          onClose={closeMember}
          onViewSlip={viewSlip}
        />
      )}

      {viewingSlip && (
        <SlipViewerModal
          slipNumber={viewingSlip}
          slipDetail={slipDetail}
          slipDetailStatus={slipDetailStatus}
          failedPhotoSlip={failedPhotoSlip}
          onFailedPhoto={setFailedPhotoSlip}
          onClose={closeSlip}
          fallbackPhoto={report?.photos[viewingSlip]}
        />
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

// A name/amount list for the monthly view -- clicking a name expands that
// customer's full slip breakdown inline (Kareem, 2026-08-18: "when
// clicking on a name, open a list of all slips for that person").
function MonthlyCustomerList({
  title,
  lines,
  color,
  slipsByCustomer,
  selectedCustomer,
  onSelectCustomer,
  onViewSlip,
  onViewMember,
}: {
  title?: string;
  lines: MonthlyCustomerLine[];
  color?: string;
  slipsByCustomer: Record<string, MonthlySlipDetail[]>;
  selectedCustomer: string | null;
  onSelectCustomer: (customer: string | null) => void;
  onViewSlip: (slipNumber: string) => void;
  // Opens that member's full (all-time) billing picture -- distinct from
  // onSelectCustomer's inline this-month-only breakdown below (Kareem,
  // 2026-08-20: "add a link on the members name to show all there sales").
  onViewMember: (customer: string) => void;
}) {
  return (
    <section>
      {title && <h2 style={{ fontSize: 16, marginBottom: 8 }}>{title}</h2>}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {lines.length === 0 && (
          <p style={{ fontSize: 13, color: "#777", margin: 0 }}>No data.</p>
        )}
        {lines.map((l) => {
          const isOpen = selectedCustomer === l.customer;
          return (
            <div key={l.customer}>
              <div style={customerRowStyle}>
                <button type="button" onClick={() => onViewMember(l.customer)} style={customerNameLinkStyle}>
                  {l.customer}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectCustomer(isOpen ? null : l.customer)}
                  style={customerAmountButtonStyle}
                >
                  <span style={{ fontWeight: 600, color: color ?? "#171717" }}>{formatMoney(l.total)}</span>
                  <span style={{ fontSize: 11, color: "#999" }}>{isOpen ? "▲" : "▼"}</span>
                </button>
              </div>
              {isOpen && (
                <div style={{ padding: "4px 0 10px 0" }}>
                  <SlipBreakdownTable slips={slipsByCustomer[l.customer] ?? []} onViewSlip={onViewSlip} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SlipBreakdownTable({
  slips,
  onViewSlip,
}: {
  slips: MonthlySlipDetail[];
  onViewSlip: (slipNumber: string) => void;
}) {
  return (
    <div style={{ overflowX: "auto", width: "100%", minWidth: 0 }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Slip Number</th>
            <th style={thStyle}>Date</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {slips.map((s) => (
            <tr key={s.slipNumber}>
              <td style={tdStyle}>
                <button type="button" onClick={() => onViewSlip(s.slipNumber)} style={slipLinkStyle}>
                  {s.slipNumber}
                </button>
              </td>
              <td style={tdStyle}>{formatShortDate(s.date)}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{formatMoney(s.amount)}</td>
              <td style={{ ...tdStyle, color: s.paid ? "#171717" : "#b00020" }}>{s.paid ? "Paid" : "Not Paid"}</td>
            </tr>
          ))}
          {slips.length === 0 && (
            <tr>
              <td style={tdStyle} colSpan={4}>
                No slips.
              </td>
            </tr>
          )}
        </tbody>
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

function toggleButtonStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "10px 0",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 8,
    border: active ? "1px solid #171717" : "1px solid #ccc",
    background: active ? "#171717" : "#fff",
    color: active ? "#fff" : "#333",
    cursor: "pointer",
    textAlign: "center",
  };
}

const customerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  padding: "6px 4px",
  borderBottom: "1px solid #eee",
  fontSize: 13,
};

const customerNameLinkStyle: React.CSSProperties = {
  padding: 0,
  border: "none",
  background: "none",
  cursor: "pointer",
  font: "inherit",
  textDecoration: "underline",
  color: "#1a73e8",
  textAlign: "left",
};

const customerAmountButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: 0,
  border: "none",
  background: "none",
  cursor: "pointer",
  font: "inherit",
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
