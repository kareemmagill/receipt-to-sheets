"use client";

import { useState } from "react";
import type { ExistingOrderSummary } from "./duplicateCheck";

// Shared by every screen that lets a slip number be clicked open into the
// combined photo + digitised SlipLayout viewer (Sales Report's daily and
// monthly views, Members Billing) -- one hook so "does this always call
// the same code" has one real answer (Kareem, 2026-08-20). Looks the slip
// up fresh via /api/slip-detail on every open rather than trusting
// whatever summary data the caller already had on hand.
export function useSlipViewer() {
  const [viewingSlip, setViewingSlip] = useState<string | null>(null);
  const [failedPhotoSlip, setFailedPhotoSlip] = useState<string | null>(null);
  const [slipDetail, setSlipDetail] = useState<ExistingOrderSummary | null>(null);
  const [slipDetailStatus, setSlipDetailStatus] = useState<"loading" | "ready" | "error">("loading");

  function viewSlip(slipNumber: string) {
    setViewingSlip(slipNumber);
    setFailedPhotoSlip(null);
    setSlipDetail(null);
    setSlipDetailStatus("loading");
    fetch(`/api/slip-detail?slipNumber=${encodeURIComponent(slipNumber)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Unknown error");
        setSlipDetail(data.existing);
        setSlipDetailStatus("ready");
      })
      .catch(() => setSlipDetailStatus("error"));
  }

  function closeSlip() {
    setViewingSlip(null);
  }

  return {
    viewingSlip,
    failedPhotoSlip,
    setFailedPhotoSlip,
    slipDetail,
    slipDetailStatus,
    viewSlip,
    closeSlip,
  };
}
