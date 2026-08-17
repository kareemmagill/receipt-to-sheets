"use client";

import { useEffect } from "react";

// The root layout only sets one static browser-tab title for the whole
// app ("PGYC Order Slip Scanner"), so every page looked the same in a
// tab bar or browser history regardless of which one you were on. Every
// page here is a client component (App Router's metadata export only
// works in server components), so this sets it imperatively instead --
// simplest fix without restructuring every page into a server/client
// split just for a tab title (Kareem, 2026-08-18).
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
