"use client";

import { useState } from "react";
import Link from "next/link";

interface Exchange {
  question: string;
  answer: string;
}

export default function QueryPage() {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk() {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Unknown error");
        return;
      }
      setExchanges((prev) => [...prev, { question: q, answer: data.answer }]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20 }}>Ask the Sales Data</h1>
        <Link href="/" style={{ fontSize: 13, color: "#555" }}>
          ← Back to scanner
        </Link>
      </div>

      <p style={{ fontSize: 12, color: "#777" }}>
        Ask questions in plain English about Sales Orders — e.g. &ldquo;how much did Peter Stevens spend in
        August?&rdquo; or &ldquo;what were the top 5 items last month?&rdquo;
      </p>

      {exchanges.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {exchanges.map((ex, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{ex.question}</div>
              <div
                style={{
                  fontSize: 14,
                  whiteSpace: "pre-wrap",
                  background: "#f4f4f4",
                  color: "#111",
                  padding: 10,
                  borderRadius: 8,
                }}
              >
                {ex.answer}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color: "#b00020", fontSize: 13 }}>Error: {error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) handleAsk();
          }}
          placeholder="Ask a question…"
          style={inputStyle}
        />
        <button onClick={handleAsk} disabled={loading || !question.trim()} style={buttonStyle}>
          {loading ? "Thinking…" : "Ask"}
        </button>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 12px",
  fontSize: 15,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: 15,
  borderRadius: 8,
  border: "1px solid #333",
  background: "#171717",
  color: "#fff",
  cursor: "pointer",
};
