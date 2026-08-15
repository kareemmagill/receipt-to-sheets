"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CustomerMonthlyTotal, ItemMonthlyTotal } from "@/lib/reports";

function formatMonth(monthKey: string): string {
  if (monthKey === "Unknown") return "Unknown / unparsed date";
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function formatShortDate(dateKey: string): string {
  if (dateKey === "Unknown") return "Unknown date";
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", day: "2-digit" });
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReportsPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [itemMonthly, setItemMonthly] = useState<ItemMonthlyTotal[]>([]);
  const [customerMonthly, setCustomerMonthly] = useState<CustomerMonthlyTotal[]>([]);
  const [monthFilter, setMonthFilter] = useState("");
  const [search, setSearch] = useState("");

  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    // Without this, a genuinely stuck request (slow/dropped connection --
    // more likely over the yacht club's WiFi than on a home connection)
    // just sits on "Loading…" forever with no feedback. 20s is generous
    // for what's normally well under a second locally.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    fetch("/api/reports", { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error ?? "Unknown error");
          setStatus("error");
          return;
        }
        setItemMonthly(data.itemMonthly);
        setCustomerMonthly(data.customerMonthly);
        // Defaults to the most recent month instead of "All months" --
        // rendering every day of every month's item breakdown at once
        // (thousands of rows) is unnecessary on first load and can make a
        // phone browser feel stuck even after the data has arrived.
        const realMonths = [...new Set<string>(data.itemMonthly.map((r: ItemMonthlyTotal) => r.monthKey))]
          .filter((m) => m !== "Unknown")
          .sort();
        const mostRecent = realMonths[realMonths.length - 1];
        if (mostRecent) setMonthFilter(mostRecent);
        setStatus("ready");
      })
      .catch((err) => {
        setError(
          err instanceof Error && err.name === "AbortError"
            ? "Timed out waiting for a response -- check your connection and try again."
            : err instanceof Error
              ? err.message
              : String(err)
        );
        setStatus("error");
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [loadAttempt]);

  const months = useMemo(() => {
    const set = new Set(itemMonthly.map((r) => r.monthKey));
    return [...set].sort().reverse();
  }, [itemMonthly]);

  const searchLower = search.trim().toLowerCase();

  const filteredItems = itemMonthly.filter(
    (r) =>
      (!monthFilter || r.monthKey === monthFilter) &&
      (!searchLower || r.item.toLowerCase().includes(searchLower))
  );

  // A search matching a customer takes priority for the headline figure --
  // "how much did X spend" is the more specific question when it applies.
  // No dedicated customer table (Kareem, 2026-08-15): just the search and
  // this total, not a full breakdown.
  const matchingCustomers = searchLower
    ? customerMonthly.filter(
        (r) => (!monthFilter || r.monthKey === monthFilter) && r.customer.toLowerCase().includes(searchLower)
      )
    : [];
  const matchedCustomerNames = [...new Set(matchingCustomers.map((r) => r.customer))];

  const totalSales =
    matchingCustomers.length > 0
      ? matchingCustomers.reduce((sum, r) => sum + r.total, 0)
      : filteredItems.reduce((sum, r) => sum + r.total, 0);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Sales Reports</h1>
        <Link href="/" style={{ fontSize: 13, color: "#555" }}>
          ← Back to scanner
        </Link>
      </div>

      {status === "loading" && <p>Loading…</p>}
      {status === "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <p style={{ color: "#b00020" }}>Error: {error}</p>
          <button
            onClick={() => {
              setStatus("loading");
              setError(null);
              setLoadAttempt((n) => n + 1);
            }}
            style={selectStyle}
          >
            Retry
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          <section
            style={{
              background: "#f4f4f4",
              borderRadius: 8,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 12, color: "#777" }}>
              Total Sales
              {monthFilter ? ` — ${formatMonth(monthFilter)}` : ""}
              {matchedCustomerNames.length > 0
                ? ` for ${matchedCustomerNames.length === 1 ? matchedCustomerNames[0] : `${matchedCustomerNames.length} matching customers`}`
                : search.trim()
                  ? ` matching "${search.trim()}"`
                  : ""}
            </span>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{formatMoney(totalSales)}</span>
          </section>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={selectStyle}>
              <option value="">All months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer or item…"
              style={inputStyle}
            />
          </div>

          {/* The item table is search-by-item only -- with a customer name
              matching, it would always show an empty "No data" table right
              under a correct total, which reads as broken rather than as
              working-as-designed. Hide it in that case instead. */}
          {matchedCustomerNames.length > 0 ? (
            <p style={{ fontSize: 13, color: "#777" }}>Clear the search to see item-by-item sales again.</p>
          ) : (
            <section>
              <h2 style={{ fontSize: 16, marginBottom: 8 }}>Sales by Menu Item, by Date</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Item</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Qty</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((r) => (
                      <tr key={`${r.dateKey}|${r.item}`}>
                        <td style={tdStyle}>{formatShortDate(r.dateKey)}</td>
                        <td style={tdStyle}>{r.item}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{r.qty}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{formatMoney(r.total)}</td>
                      </tr>
                    ))}
                    {filteredItems.length === 0 && (
                      <tr>
                        <td style={tdStyle} colSpan={4}>
                          No data.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#fff",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid #ccc",
  flex: 1,
  minWidth: 160,
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
