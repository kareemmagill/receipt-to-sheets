"use client";

import { useState } from "react";

// A custom month-grid picker, not <input type="date"> -- native date
// inputs give zero hooks to mark individual days. Days with recorded
// sales get a white-to-yellow heat map background, scaled per viewed
// month against whichever day sold the most that month (full yellow) --
// no sales stays white (Kareem, 2026-08-18). Value/onChange both use the
// same yyyy-mm-dd string the rest of the app already works with.

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// White (0) -> yellow (1). Keeps red at 255 throughout and only fades
// green/blue down, so black day-number text stays readable at every
// intensity, not just the pale end.
function heatMapColor(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const g = Math.round(255 - clamped * (255 - 214));
  const b = Math.round(255 - clamped * 255);
  return `rgb(255, ${g}, ${b})`;
}

export function DateCalendar({
  value,
  onChange,
  salesByDate,
}: {
  value: string; // yyyy-mm-dd
  onChange: (dateKey: string) => void;
  // Total sales per date (yyyy-mm-dd) -- powers the heat map.
  salesByDate: Record<string, number>;
}) {
  const selected = parseDateKey(value);
  const initial = selected ?? { year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: 1 };
  // The month currently being viewed -- starts on the selected date's
  // month, but browsing away from it (prev/next) doesn't move the
  // selection itself, only what's displayed.
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month); // 1-12

  function goToPrevMonth() {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const monthLabel = new Date(viewYear, viewMonth - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Scaled per viewed month, not globally -- "full yellow" means the
  // busiest day of *this* month, so switching months doesn't wash out a
  // slower month by comparing it against a much busier one elsewhere.
  let monthMax = 0;
  for (const day of cells) {
    if (day === null) continue;
    const total = salesByDate[toDateKey(viewYear, viewMonth, day)] ?? 0;
    monthMax = Math.max(monthMax, total);
  }

  const todayKey = toDateKey(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 10, width: "100%", maxWidth: 320 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button type="button" onClick={goToPrevMonth} style={navButtonStyle} aria-label="Previous month">
          ‹
        </button>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{monthLabel}</span>
        <button type="button" onClick={goToNextMonth} style={navButtonStyle} aria-label="Next month">
          ›
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, color: "#999", padding: "2px 0" }}>
            {label}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />;
          const dateKey = toDateKey(viewYear, viewMonth, day);
          const isSelected = dateKey === value;
          const isToday = dateKey === todayKey;
          const daySales = salesByDate[dateKey] ?? 0;
          const heatColor = monthMax > 0 ? heatMapColor(daySales / monthMax) : "#fff";
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onChange(dateKey)}
              style={{
                padding: "6px 0",
                fontSize: 13,
                borderRadius: 6,
                border: isToday ? "1px solid #999" : "1px solid transparent",
                background: isSelected ? "#171717" : heatColor,
                color: isSelected ? "#fff" : "#111",
                fontWeight: daySales > 0 ? 700 : 400,
                cursor: "pointer",
              }}
            >
              {day}
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
