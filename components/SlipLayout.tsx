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
  // Per-item counterpart to problemFlag below -- reddens just this line
  // instead of only the slip-wide notice at the bottom (Kareem,
  // 2026-08-20: "make the item text red").
  problem?: boolean;
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
  // Set when this slip has an unresolved Problem/Unsure flag (see
  // components/VerificationForm.tsx) -- prints a notice at the bottom of
  // every digital slip view, not just the Confirmation screen, since all
  // of them (Confirmation, Duplicate Slip, Daily Report's slip viewer,
  // Review Problem Records) render through this same layout (Kareem,
  // 2026-08-20: "at the bottom of the digital slip write - problem slip
  // for review").
  problemFlag?: boolean;
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SlipLayout({ slipNumber, slipType, customer, waitress, date, memberStatus, items, total, terms, problemFlag }: SlipLayoutProps) {
  const headingLabel = slipType === "Restaurant" ? "FOOD ORDER SLIP" : "ORDER SLIP (BAR)";
  const paymentLabel = terms === "CREDIT" ? "Not Paid" : terms === "COD" ? "Paid" : undefined;

  return (
    // color explicit on this container (not just background) -- most of
    // this card's own text never set its own color, so it was inheriting
    // the app shell's light/white text color (set for the page's dark
    // background) straight through onto this deliberately light card,
    // washing out everything except the handful of fields that happened
    // to already set an explicit color (found via screenshot, Kareem,
    // 2026-08-20: "whats wrong with the colors"). Setting it once here
    // gives every descendant a correct color to inherit instead.
    <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 14, background: "#fdfdfb", color: "#111" }}>
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
          {memberStatus && memberStatus !== "Member" && memberStatus !== "Non-Member" && (
            // One of the Other sub-options (Staff/Classic C/Wine C/
            // Reciprocal, or any future addition) -- neither checkbox
            // above applies to it, so it's written out plainly instead
            // (Kareem, 2026-08-20: "write that option down above the
            // date / below non-member"). Not a fixed list here -- any
            // status that isn't literally Member/Non-Member is treated
            // this way, so this stays correct if VerificationForm's
            // Other options ever change without a second edit here.
            <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginTop: 2 }}>{memberStatus}</div>
          )}
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
            <tr key={i} style={item.problem ? { color: "#b00020" } : undefined}>
              <td style={slipTdStyle}>{item.qty}</td>
              <td style={slipTdStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>
                    {item.description}
                    {item.itemCode && <span style={{ color: item.problem ? undefined : "#999" }}> ({item.itemCode})</span>}
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

      {problemFlag && (
        <div style={{ textAlign: "center", marginTop: 8, padding: "6px 0", borderTop: "1px dashed #b00020", fontSize: 13, fontWeight: 700, color: "#b00020" }}>
          ❓ PROBLEM SLIP — FOR REVIEW
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
