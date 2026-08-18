"use client";

// Hands a queued photo's already-downloaded data URL from the Process
// Queue page over to the scanner page, so processing it can reuse the
// exact same extract/verify/save flow as a live scan instead of a second
// copy of that logic (Kareem, 2026-08-20). sessionStorage, not app state
// -- the handoff crosses a full page navigation (router.push("/")).
const KEY = "pgyc_pending_upload_handoff";

export interface PendingUploadHandoff {
  rowNumber: number;
  imageDataUrl: string;
}

export function savePendingUploadHandoff(data: PendingUploadHandoff) {
  sessionStorage.setItem(KEY, JSON.stringify(data));
}

// Consumes the handoff -- read once, then gone, so refreshing the scanner
// page afterward doesn't keep re-loading the same queued photo.
export function takePendingUploadHandoff(): PendingUploadHandoff | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
