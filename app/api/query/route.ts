import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { readTab } from "@/lib/googleSheets";

const client = new Anthropic();

// Report sessions are usually several questions in a row against the same
// data -- without this, every question re-reads both full sheets from
// Google even though nothing changed between them. 60s keeps results close
// to live (this is a reporting tool, not the save path, so a few seconds of
// staleness is fine) while collapsing a back-to-back Q&A session onto one
// actual read.
const getCachedReportData = unstable_cache(
  async () => {
    const [salesRows, customerRows] = await Promise.all([
      readTab("Sales Orders"),
      readTab("Customers"),
    ]);
    return { salesRows, customerRows };
  },
  ["query-report-data"],
  { revalidate: 60 }
);

function rowsToText(rows: string[][]): string {
  return rows.map((r) => r.join(" | ")).join("\n");
}

const SYSTEM_PROMPT = `You are a data assistant for PGYC (a yacht club)'s sales order records.

You are given the current contents of two Google Sheets tabs:
1. "Sales Orders" — one row per line item (multiple rows can belong to the same order, sharing the same AR Number and Order Slip Number). Columns, in order: Name, Class, Order Slip Date, Order Slip Number, AR NO., Terms, Memo, Class (repeated), QTY, Invoice Class, Item, Description, Rate, Amount.
2. "Customers" — the club's member list, one name per line.

Answer the user's question using only this data. Do any counting, summing, filtering, or date comparisons yourself, precisely — don't estimate. Dates are written DD/MM/YYYY, day first, not month-first (changed 2026-08-16 -- older rows predating that change may still be month-first; if a date's day component is ≤12 and you're relying on it for something date-sensitive, note the ambiguity rather than silently picking one reading). If the data needed to answer isn't present, or the question is ambiguous, say so plainly rather than guessing.

Keep your answer concise: a direct sentence or two, with a short breakdown or table only if it meaningfully clarifies the answer.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question: string | undefined = body?.question;

    if (!question || !question.trim()) {
      return NextResponse.json({ ok: false, error: "Missing question" }, { status: 400 });
    }

    const { salesRows, customerRows } = await getCachedReportData();

    const dataBlock = `SALES ORDERS:\n${rowsToText(salesRows)}\n\nCUSTOMERS:\n${rowsToText(customerRows)}`;

    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      // Opus 5 defaults to adaptive extended thinking, which self-decides
      // how much to "think" before answering -- against the real sheet
      // (hundreds of thousands of tokens of sales history), it was spending
      // the *entire* max_tokens budget on thinking and returning zero
      // actual answer text (stop_reason: "max_tokens", content: only a
      // thinking block -- confirmed against the real data 2026-08-16).
      // This is a deterministic counting/filtering task over a table, not
      // something that benefits from open-ended reasoning, so thinking is
      // switched off outright rather than just budgeted smaller.
      thinking: { type: "disabled" },
      // Cached (system prompt is static every call; the data block is the
      // same for every question inside the 60s data-cache window above) --
      // a follow-up question in the same report session reuses both
      // instead of Opus reprocessing the whole sheet dump from scratch each
      // time. The question itself is a separate, uncached block since it's
      // the one thing that actually changes per request.
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: dataBlock, cache_control: { type: "ephemeral" } },
            { type: "text", text: `Question: ${question}` },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ ok: false, error: "The AI declined to answer this question." }, { status: 422 });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const answer = textBlock && textBlock.type === "text" ? textBlock.text : "";

    return NextResponse.json({ ok: true, answer });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
