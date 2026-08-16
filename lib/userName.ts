// Client-only. Who's using this browser -- asked once (see app/page.tsx's
// landing-page prompt) and remembered from then on, so it doesn't get
// asked again on every visit (Kareem, 2026-08-17: "ask it once when first
// landing on the front page").
const USER_NAME_KEY = "pgyc_user_name";

export function getStoredUserName(): string {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(USER_NAME_KEY) ?? "").trim();
}

export function setStoredUserName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_NAME_KEY, name.trim());
}
