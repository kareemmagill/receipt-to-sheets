"use client";

import { useState } from "react";
import type { MemberSpendEntry } from "@/lib/membersBilling";
import { useSlipViewer } from "@/lib/useSlipViewer";
import { useMemberDetail } from "@/lib/useMemberDetail";
import { SlipViewerModal } from "@/components/SlipViewerModal";
import { MemberDetailModal } from "@/components/MemberDetailModal";

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SUGGESTION_LIMIT = 8;

// The Members Billing search box -- its own page (app/members-billing/
// page.tsx), linked off a button on the Scan a Slip page (Kareem,
// 2026-08-20: "move the members billing into its own page"). Suggestions
// rank biggest spender first (already sorted server-side by
// lib/membersBilling.ts's membersBySpend), so an empty query just browses
// the top spenders and typing narrows that same ranked list. Selecting
// one opens the same full billing picture (total sales, total dues,
// every slip) shared with the Monthly Sales view's "view all sales" link.
// No heading of its own -- the page it's embedded in supplies that.
export function MembersBilling() {
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<MemberSpendEntry[] | null>(null);
  const [membersStatus, setMembersStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { viewingMember, memberDetail, memberDetailStatus, viewMember, closeMember } = useMemberDetail();
  const { viewingSlip, failedPhotoSlip, setFailedPhotoSlip, slipDetail, slipDetailStatus, viewSlip, closeSlip } =
    useSlipViewer();

  function loadMembers() {
    if (membersStatus !== "idle") return;
    setMembersStatus("loading");
    fetch("/api/members-billing")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error ?? "Unknown error");
        setMembers(data.members);
        setMembersStatus("ready");
      })
      .catch(() => setMembersStatus("error"));
  }

  const filtered = members
    ? members.filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, SUGGESTION_LIMIT)
    : [];

  function handleSelect(name: string) {
    setQuery(name);
    setShowSuggestions(false);
    viewMember(name);
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => {
            loadMembers();
            setShowSuggestions(true);
          }}
          placeholder="Search member name…"
          style={inputStyle}
        />
        {showSuggestions && membersStatus !== "idle" && (
          <div style={dropdownStyle}>
            {membersStatus === "loading" && <p style={{ fontSize: 13, color: "#777", margin: "8px 10px" }}>Loading…</p>}
            {membersStatus === "error" && (
              <p style={{ fontSize: 13, color: "#b00020", margin: "8px 10px" }}>Couldn&apos;t load members.</p>
            )}
            {membersStatus === "ready" && filtered.length === 0 && (
              <p style={{ fontSize: 13, color: "#777", margin: "8px 10px" }}>No matching member.</p>
            )}
            {filtered.map((m) => (
              <button key={m.name} type="button" onClick={() => handleSelect(m.name)} style={suggestionRowStyle}>
                <span>{m.name}</span>
                <span style={{ color: "#777" }}>{formatMoney(m.totalSpend)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {viewingMember && (
        <MemberDetailModal
          memberName={viewingMember}
          detail={memberDetail}
          status={memberDetailStatus}
          onClose={closeMember}
          onViewSlip={viewSlip}
        />
      )}

      {viewingSlip && (
        <SlipViewerModal
          slipNumber={viewingSlip}
          slipDetail={slipDetail}
          slipDetailStatus={slipDetailStatus}
          failedPhotoSlip={failedPhotoSlip}
          onFailedPhoto={setFailedPhotoSlip}
          onClose={closeSlip}
        />
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 14,
  borderRadius: 8,
  border: "1px solid #ccc",
  color: "#111",
  background: "#fff",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  background: "#fff",
  border: "1px solid #ccc",
  borderRadius: 8,
  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
  maxHeight: 260,
  overflowY: "auto",
  zIndex: 50,
};

const suggestionRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  width: "100%",
  padding: "8px 10px",
  border: "none",
  borderBottom: "1px solid #eee",
  background: "none",
  cursor: "pointer",
  fontSize: 13,
  font: "inherit",
  color: "#111",
  textAlign: "left",
};
