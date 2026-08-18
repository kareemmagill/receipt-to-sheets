"use client";

import { useState } from "react";
import type { MemberBillingDetail } from "./membersBilling";

// Shared by every screen that opens a member's full billing picture --
// Members Billing's search box and the Monthly Sales view's "view all
// sales" link on a customer name (Kareem, 2026-08-20) -- same
// one-hook-one-code-path reasoning as lib/useSlipViewer.ts.
export function useMemberDetail() {
  const [viewingMember, setViewingMember] = useState<string | null>(null);
  const [memberDetail, setMemberDetail] = useState<MemberBillingDetail | null>(null);
  const [memberDetailStatus, setMemberDetailStatus] = useState<"loading" | "ready" | "error">("loading");

  function viewMember(name: string) {
    setViewingMember(name);
    setMemberDetail(null);
    setMemberDetailStatus("loading");
    fetch(`/api/members-billing/detail?name=${encodeURIComponent(name)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Unknown error");
        setMemberDetail(data.detail);
        setMemberDetailStatus("ready");
      })
      .catch(() => setMemberDetailStatus("error"));
  }

  function closeMember() {
    setViewingMember(null);
  }

  return { viewingMember, memberDetail, memberDetailStatus, viewMember, closeMember };
}
