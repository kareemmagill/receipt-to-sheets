// Client-only. Lets each browser/device be told apart in the sheet without
// asking anyone to identify themselves -- browsers don't expose a real
// device ID, so this is a random one generated once and kept in
// localStorage, which is as close as the web platform gets. Two staff on
// identical iPhones running the same browser will get different IDs; the
// same phone reused later keeps the same one, unless storage gets cleared
// or it's a private/incognito window (Kareem, 2026-08-17: "identify the
// device that's entering").
const DEVICE_ID_KEY = "pgyc_device_id";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// Coarse device/browser hint from the user agent -- not a precise model
// (browsers don't expose that), just enough to tell "an iPhone" from "a
// laptop" at a glance in the sheet. The ID suffix is what actually
// distinguishes two installs of the same browser/OS combo.
function deviceKind(ua: string): string {
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Unknown device";
}

function browserKind(ua: string): string {
  if (/CriOS/.test(ua)) return "Chrome";
  if (/FxiOS/.test(ua)) return "Firefox";
  if (/EdgiOS|Edg\//.test(ua)) return "Edge";
  if (/Chrome/.test(ua)) return "Chrome";
  if (/Firefox/.test(ua)) return "Firefox";
  if (/Safari/.test(ua)) return "Safari";
  return "";
}

// e.g. "iPhone (Safari) · a1b2c3d4"
export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const browser = browserKind(ua);
  const label = browser ? `${deviceKind(ua)} (${browser})` : deviceKind(ua);
  return `${label} · ${getDeviceId().slice(0, 8)}`;
}
