"use client";

import { useState } from "react";

// The Monthly Sales view's month picker -- a 12-cell year grid, same
// white-to-yellow heat map style as DateCalendar's day grid, just scaled
// per viewed year instead of per viewed month (Kareem, 2026-08-18:
// "present a 12 month calender witht the same stlye heatmap").

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseMonthKey(monthKey: string): { year: number; month: number } | null {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toMonthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

// Same ramp as DateCalendar's heatMapColor -- keeps R=255 throughout so
// black text stays readable at every intensity.
function heatMapColor(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const g = Math.round(255 - clamped * (255 - 214));
  const b = Math.round(255 - clamped * 255);
  return `rgb(255, ${g}, ${b})`;
}

export function MonthCalendar({
  value,
  onChange,
  salesByMonth,
}: {
  value: string; // yyyy-mm
  onChange: (monthKey: string) => void;
  // Total sales per month (yyyy-mm) -- powers the heat map.
  salesByMonth: Record<string, number>;
}) {
  const selected = parseMonthKey(value);
  const [viewYear, setViewYear] = useState(selected?.year ?? new Date().getFullYear());

  const todayKey = toMonthKey(new Date().getFullYear(), new Date().getMonth() + 1);

  // Scaled per viewed year, not globally -- "full yellow" means the
  // busiest month of *this* year.
  let yearMax = 0;
  for (let m = 1; m <= 12; m++) {
    yearMax = Math.max(yearMax, salesByMonth[toMonthKey(viewYear, m)] ?? 0);
  }

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 10, width: "100%", maxWidth: 320 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button type="button" onClick={() => setViewYear((y) => y - 1)} style={navButtonStyle} aria-label="Previous year">
          ‹
        </button>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{viewYear}</span>
        <button type="button" onClick={() => setViewYear((y) => y + 1)} style={navButtonStyle} aria-label="Next year">
          ›
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
        {MONTH_LABELS.map((label, i) => {
          const month = i + 1;
          const monthKey = toMonthKey(viewYear, month);
          const isSelected = monthKey === value;
          const isCurrent = monthKey === todayKey;
          const monthSales = salesByMonth[monthKey] ?? 0;
          const heatColor = yearMax > 0 ? heatMapColor(monthSales / yearMax) : "#fff";
          return (
            <button
              key={monthKey}
              type="button"
              onClick={() => onChange(monthKey)}
              style={{
                padding: "10px 0",
                fontSize: 13,
                borderRadius: 6,
                border: isCurrent ? "1px solid #999" : "1px solid transparent",
                background: isSelected ? "#171717" : heatColor,
                color: isSelected ? "#fff" : "#111",
                fontWeight: monthSales > 0 ? 700 : 400,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const navButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 16,
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#fff",
  color: "#111",
  cursor: "pointer",
};
