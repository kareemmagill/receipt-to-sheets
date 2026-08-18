import type { MemberBillingDetail } from "@/lib/membersBilling";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  if (!y || !m || !d) return dateKey;
  return `${d}/${m}/${y}`;
}

// One member's full billing picture -- total sales, total dues, and every
// slip on record, each linking into the same combined photo + digitised
// viewer as everywhere else (see SlipViewerModal). Shared by Members
// Billing's search box and the Monthly Sales view's "view all sales" link
// (Kareem, 2026-08-20).
export function MemberDetailModal({
  memberName,
  detail,
  status,
  onClose,
  onViewSlip,
}: {
  memberName: string;
  detail: MemberBillingDetail | null;
  status: "loading" | "ready" | "error";
  onClose: () => void;
  onViewSlip: (slipNumber: string) => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        overflowY: "auto",
        padding: 16,
        gap: 10,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 600,
          background: "#fff",
          borderRadius: 8,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h2 style={{ fontSize: 16, margin: 0 }}>{memberName}</h2>

        {status === "loading" && <p style={{ fontSize: 13, color: "#777", margin: 0 }}>Loading…</p>}
        {status === "error" && (
          <p style={{ fontSize: 13, color: "#b00020", margin: 0 }}>Couldn&apos;t load this member&apos;s sales.</p>
        )}

        {status === "ready" && detail && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
              <SummaryCard label="Total Sales" amount={detail.totalSales} />
              <SummaryCard label="Total Dues" amount={detail.totalDues} color={detail.totalDues > 0 ? "#b00020" : undefined} />
            </div>

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
                  {detail.slips.map((s) => (
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
                  {detail.slips.length === 0 && (
                    <tr>
                      <td style={tdStyle} colSpan={4}>
                        No slips.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, amount, color }: { label: string; amount: number; color?: string }) {
  return (
    <div style={{ background: "#f4f4f4", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 12, color: "#777" }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color: color ?? "#171717" }}>{formatMoney(amount)}</span>
    </div>
  );
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "2px solid #ccc",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #eee" };

const slipLinkStyle: React.CSSProperties = {
  padding: 0,
  border: "none",
  background: "none",
  color: "#1a73e8",
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
};
