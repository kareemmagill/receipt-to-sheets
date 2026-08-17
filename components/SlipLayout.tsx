// Recreates the real printed order slip's layout for the recap screens
// (Duplicate Slip, Confirmation) -- studied from the actual paper form
// (Kareem, 2026-08-18: "analyze the layout... position of all the data
// field headers, handwriting, tickbox, and try to imitate the layout").
//
// The real slip, top to bottom: club name (centered) with the printed
// slip number top-right; "ORDER SLIP (BAR)" or "FOOD ORDER SLIP"
// top-left with Member/Non-Member checkboxes top-right (checkboxes sit
// under the slip number, not the club name); Customer + Date on one
// line, Waitress alone on the next; a two-column QTY | FOOD table where
// the amount is written at the right edge of the FOOD column itself, not
// a separate column; a total; and (not on the paper itself, but the
// digital equivalent of "pd.") a payment status.

export interface SlipLayoutItem {
  qty: string;
  description: string;
  itemCode?: string;
  amount: string;
}

export interface SlipLayoutProps {
  slipNumber: string;
  slipType: string; // "Bar" | "Restaurant" | ""
  customer: string;
  waitress: string;
  date: string;
  memberStatus: string; // "Member" | "Non-Member" | ""
  items: SlipLayoutItem[];
  total: number;
  terms?: string; // "COD" | "CREDIT" | "" -- omitted entirely if not provided
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SlipLayout({ slipNumber, slipType, customer, waitress, date, memberStatus, items, total, terms }: SlipLayoutProps) {
  const headingLabel = slipType === "Restaurant" ? "FOOD ORDER SLIP" : "ORDER SLIP (BAR)";
  const paymentLabel = terms === "CREDIT" ? "Not Paid" : terms === "COD" ? "Paid" : undefined;

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 14, background: "#fdfdfb" }}>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 13, letterSpacing: "0.02em" }}>
        PUERTO GALERA YACHT CLUB, INC.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{headingLabel}</span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#777" }}>
            No. <span style={{ fontWeight: 700, color: "#111" }}>{slipNumber}</span>
          </div>
          <div style={{ fontSize: 12, marginTop: 2 }}>
            <CheckboxLabel checked={memberStatus === "Member"} label="Member" />
          </div>
          <div style={{ fontSize: 12 }}>
            <CheckboxLabel checked={memberStatus === "Non-Member"} label="Non-Member" />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8, fontSize: 13 }}>
        <SlipField label="Customer" value={customer} />
        <SlipField label="Date" value={date} align="right" />
      </div>
      <div style={{ marginTop: 4, fontSize: 13 }}>
        <SlipField label="Waitress" value={waitress} />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
        <thead>
          <tr>
            <th style={slipThStyle}>QTY</th>
            <th style={{ ...slipThStyle, textAlign: "left" }}>FOOD</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td style={slipTdStyle}>{item.qty}</td>
              <td style={slipTdStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>
                    {item.description}
                    {item.itemCode && <span style={{ color: "#999" }}> ({item.itemCode})</span>}
                  </span>
                  <span>{item.amount}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #333", marginTop: 4, paddingTop: 6, fontWeight: 700, fontSize: 14 }}>
        <span>Total</span>
        <span>{formatMoney(total)}</span>
      </div>

      {paymentLabel && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 13, color: "#555" }}>
          <span>Payment</span>
          <span>{paymentLabel}</span>
        </div>
      )}
    </div>
  );
}

function CheckboxLabel({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span>
      {checked ? "☑" : "☐"} {label}
    </span>
  );
}

function SlipField({ label, value, align }: { label: string; value: string; align?: "left" | "right" }) {
  return (
    <div style={{ textAlign: align, flex: 1, minWidth: 0 }}>
      <span style={{ color: "#777" }}>{label}: </span>
      <span style={{ borderBottom: "1px solid #ccc" }}>{value || "      "}</span>
    </div>
  );
}

const slipThStyle: React.CSSProperties = {
  textAlign: "center",
  borderTop: "2px solid #333",
  borderBottom: "1px solid #333",
  padding: "4px 6px",
  fontSize: 12,
};

const slipTdStyle: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "4px 6px",
  verticalAlign: "top",
};
