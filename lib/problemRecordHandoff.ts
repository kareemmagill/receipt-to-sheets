"use client";

import type { OrderSlipExtraction } from "@/lib/extractSchema";
import type { ItemCodeEntry } from "@/lib/itemCodeScoring";
import type { EditableOrder } from "@/components/VerificationForm";

// Hands an already-loaded flagged slip from the Review Problem Records
// page over to the scanner page's edit flow, the same way
// lib/pendingUploadHandoff.ts hands a queued photo over -- sessionStorage,
// not app state, since the handoff crosses a full page navigation
// (router.push("/")).
const KEY = "pgyc_problem_record_handoff";

export interface ProblemRecordHandoff {
  order: EditableOrder;
  extraction: OrderSlipExtraction;
  itemTemplate: ItemCodeEntry[];
  imageDataUrl: string | null;
}

export function saveProblemRecordHandoff(data: ProblemRecordHandoff) {
  sessionStorage.setItem(KEY, JSON.stringify(data));
}

// Consumes the handoff -- read once, then gone, so refreshing the scanner
// page afterward doesn't keep re-loading the same flagged slip.
export function takeProblemRecordHandoff(): ProblemRecordHandoff | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
