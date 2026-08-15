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

  useEffect(() => {
    fetch("/api/reports")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error ?? "Unknown error");
          setStatus("error");
          return;
        }
        setItemMonthly(data.itemMonthly);
        setCustomerMonthly(data.customerMonthly);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
  }, []);

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
      {status === "error" && <p style={{ color: "#b00020" }}>Error: {error}</p>}

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
