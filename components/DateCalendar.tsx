"use client";

import { useState } from "react";

// A custom month-grid picker, not <input type="date"> -- native date
// inputs give zero hooks to mark individual days, and Kareem wanted days
// with recorded sales visually distinguished (bold) right in the picker
// (2026-08-18). Value/onChange both use the same yyyy-mm-dd string the
// rest of the app already works with.

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

export function DateCalendar({
  value,
  onChange,
  markedDates,
}: {
  value: string; // yyyy-mm-dd
  onChange: (dateKey: string) => void;
  // Dates (yyyy-mm-dd) to bold -- e.g. days with recorded sales.
  markedDates: Set<string>;
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
          const hasSales = markedDates.has(dateKey);
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
                background: isSelected ? "#171717" : "transparent",
                color: isSelected ? "#fff" : "#111",
                fontWeight: hasSales ? 700 : 400,
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
