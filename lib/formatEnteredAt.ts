// Shared by app/page.tsx (Duplicate Slip banner) and
// app/daily-report/page.tsx (Sales Report slip viewer) -- both show a
// digitised slip alongside its photo and need the same "who/when
// digitized this" label (Kareem, 2026-08-18/2026-08-20). Stored as
// ISO/UTC (see buildSalesOrderRows); collapsed to whichever of
// Just Now/Today/Yesterday/date reads most naturally, falling through to
// dd/mm/yyyy for anything older.
export function formatEnteredAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;

  const now = new Date();
  if (now.getTime() - d.getTime() < 60_000) return "Just Now";

  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
