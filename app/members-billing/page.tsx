"use client";

import Link from "next/link";
import { usePageTitle } from "@/lib/usePageTitle";
import { MembersBilling } from "@/components/MembersBilling";

export default function MembersBillingPage() {
  usePageTitle("Members Billing");

  return (
    <main
      style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 20 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Members Billing</h1>
        <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
          <Link href="/" style={{ color: "#555" }}>
            ← Back to scanner
          </Link>
        </div>
      </div>

      <MembersBilling />
    </main>
  );
}
