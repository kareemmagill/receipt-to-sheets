import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readTab } from "@/lib/googleSheets";

const client = new Anthropic();

function rowsToText(rows: string[][]): string {
  return rows.map((r) => r.join(" | ")).join("\n");
}

const SYSTEM_PROMPT = `You are a data assistant for PGYC (a yacht club)'s sales order records.

You are given the current contents of two Google Sheets tabs:
1. "Sales Orders" — one row per line item (multiple rows can belong to the same order, sharing the same AR Number and Order Slip Number). Columns, in order: Name, Class, Order Slip Date, Order Slip Number, AR NO., Terms, Memo, Class (repeated), QTY, Invoice Class, Item, Description, Rate, Amount.
2. "Customers" — the club's member list, one name per line.

Answer the user's question using only this data. Do any counting, summing, filtering, or date comparisons yourself, precisely — don't estimate. Dates are written M/D/YY or M/D/YYYY (month first), not day-first. If the data needed to answer isn't present, or the question is ambiguous, say so plainly rather than guessing.

Keep your answer concise: a direct sentence or two, with a short breakdown or table only if it meaningfully clarifies the answer.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question: string | undefined = body?.question;

    if (!question || !question.trim()) {
      return NextResponse.json({ ok: false, error: "Missing question" }, { status: 400 });
    }

    const [salesRows, customerRows] = await Promise.all([
      readTab("Sales Orders"),
      readTab("Customers"),
    ]);

    const dataBlock = `SALES ORDERS:\n${rowsToText(salesRows)}\n\nCUSTOMERS:\n${rowsToText(customerRows)}`;

    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${dataBlock}\n\nQuestion: ${question}`,
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
