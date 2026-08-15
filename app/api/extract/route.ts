import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ORDER_SLIP_SCHEMA, type OrderSlipExtraction, type OrderSlipItem } from "@/lib/extractSchema";
import { readTab } from "@/lib/googleSheets";
import { matchCustomer } from "@/lib/customerMatch";
import {
  loadItemCodeTemplate,
  matchItemCodeCandidates,
  guessClass,
  ITEM_MATCH_CONFIDENT_THRESHOLD,
} from "@/lib/itemCodeMatch";

const client = new Anthropic();

// A match below this score is too weak to auto-suggest — the raw
// handwriting is shown instead and the user picks manually.
const CUSTOMER_MATCH_THRESHOLD = 0.5;

const SYSTEM_PROMPT = `You are reading a photograph of a handwritten bar / restaurant / yacht club order slip (a sales/order slip from a members' club, e.g. PGYC).

These slips are handwritten and may contain: messy handwriting, abbreviations, repeated items, crossed-out items, quantities, handwritten prices, handwritten totals, customer/member names, dates, checkboxes, waiter/waitress information, and member/non-member information.

Rules — follow these exactly:
- Extract only information you can actually see on the slip. Never invent or guess missing information.
- Preserve abbreviations and item/food/drink names exactly as handwritten in "description" (e.g. "SMA", "SML" stay as written — do not expand or correct them). Do not try to look up an official item code yourself — the app does that separately.
- Keep repeated items as separate line entries unless the slip clearly writes them as one combined quantity (e.g. "3x Red Horse" written once is one line with qty 3; "Red Horse" written on three separate lines is three lines each with qty 1).
- If a crossed-out item is fully struck through, omit it from the items list.
- If a field genuinely cannot be read or is not present on the slip, return an empty string for it — never fabricate a value to fill the field.
- There are two different printed slip forms: a Bar "Order Slip", and a "Food Order Slip" for the Restaurant. Identify which one this is from its heading and set "slip_type" accordingly. This also tells you where to find the slip number: on the Bar Order Slip, "NO"/"NO." is in the top-right corner; on the Food Order Slip (Restaurant), it's in the bottom-right corner. Don't confuse the slip number with an AR number, table number, or phone number.
- If a "Non-Member" checkbox/marking is ticked, still do your best to read and extract whatever name is actually written on the slip, even if it's messy or only partly legible — a non-member marking does not mean the name should be ignored. Only if the slip is marked Non-Member AND genuinely has no legible name at all, set "customer_written" to exactly "DIRECT SALES- WALK IN" (the club's account for walk-in/non-member sales) as a fallback.
- The customer/member name is usually followed by a second handwritten line naming the waiter/waitress who took the order — that second line is NOT part of the customer's name. Put it in "waitress_written" instead, and keep "customer_written" to just the customer's own name.
- "terms" must be exactly "COD" or "CREDIT" (or an empty string if you can't tell): look for an explicit written word ("COD", "Credit", "Charge"), a checked/circled box, or another clear marking distinguishing a member charge account (CREDIT) from a cash-paid order (COD).
- Set "member_status" to "Member" or "Non-Member" based on the slip's Member/Non-Member checkbox or marking (separately from whatever you set "customer_written" to — report this even when a name is legible).
- The single number written after an item's description is its line total ("amount") — these slips don't have a separate per-unit rate column, so don't try to read one; the app computes it from amount ÷ qty.
- For each item line, set "confidence" between 0 and 1 for how sure you are of that line's reading.
- Set "overall_confidence" between 0 and 1 for the whole extraction.
- List the names of any fields you are unsure about in "uncertain_fields" (e.g. "order_slip_date", "items[1].amount").

Return your extraction as structured JSON matching the provided schema.`;

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }
  return { mediaType: match[1], data: match[2] };
}

interface RawVisionItem {
  qty?: string;
  description?: string;
  amount?: string;
  confidence?: number;
}

// Rate is never read off a slip (see the system prompt) -- always derived
// from amount / qty, same formula and formatting as the live recalculation
// in components/VerificationForm.tsx's updateItem.
function deriveRate(amount: string, qty: string): string {
  const amountNum = parseFloat(amount.replace(/[^0-9.-]/g, ""));
  const qtyNum = parseFloat(qty.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(amountNum) || !Number.isFinite(qtyNum) || qtyNum === 0) return "";
  const rate = amountNum / qtyNum;
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(2);
}

interface RawVisionExtraction {
  customer_written?: string;
  waitress_written?: string;
  slip_type?: string;
  order_slip_date?: string;
  order_slip_number?: string;
  terms?: string;
  member_status?: string;
  memo?: string;
  items?: RawVisionItem[];
  overall_confidence?: number;
  uncertain_fields?: string[];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const imageDataUrl: string | undefined = body?.imageDataUrl;

    if (!imageDataUrl) {
      return NextResponse.json({ ok: false, error: "Missing imageDataUrl" }, { status: 400 });
    }

    const { mediaType, data } = parseDataUrl(imageDataUrl);

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data,
              },
            },
            { type: "text", text: "Extract the order slip data from this photo." },
          ],
        },
      ],
      output_config: {
        format: { type: "json_schema", schema: ORDER_SLIP_SCHEMA },
      },
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { ok: false, error: "The AI declined to process this image." },
        { status: 422 }
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ ok: false, error: "No text in AI response" }, { status: 500 });
    }

    const raw: RawVisionExtraction = JSON.parse(textBlock.text);
    const uncertainFields = [...(raw.uncertain_fields ?? [])];

    // The physical slip form (Bar vs Restaurant) is a stronger signal than
    // guessing Class from an individual item's name, so it takes priority
    // when the model could read the heading.
    const slipType = raw.slip_type === "Bar" || raw.slip_type === "Restaurant" ? raw.slip_type : "";
    if (!slipType) {
      uncertainFields.push("slip_type (couldn't tell Bar vs Restaurant from the heading — Class guessed per item)");
    }

    // Look up an item code + Restaurant/Bar class for each line, using the
    // live Item Code Template tab. A missing template read shouldn't block
    // the whole extraction — items just come back uncoded for manual entry.
    let itemTemplate: Awaited<ReturnType<typeof loadItemCodeTemplate>> = [];
    try {
      itemTemplate = await loadItemCodeTemplate();
    } catch {
      // fall through with an empty template
    }

    const items: OrderSlipItem[] = (raw.items ?? []).map((item, index) => {
      const description = item.description ?? "";
      const candidates = matchItemCodeCandidates(description, itemTemplate, 5);
      const codeMatch = candidates[0] && candidates[0].score >= 0.5 ? candidates[0] : null;

      if (!codeMatch) {
        uncertainFields.push(`items[${index}].item (no confident code match — check manually)`);
      } else if (codeMatch.score < ITEM_MATCH_CONFIDENT_THRESHOLD) {
        uncertainFields.push(`items[${index}].item (partial code match — please verify)`);
      }

      // Invoice Class is always the same Restaurant/Bar value as Class —
      // confirmed against the real sheet data, where they're always equal.
      const itemClass = slipType || guessClass(description, codeMatch?.entry.category);

      const qty = item.qty ?? "";
      const amount = item.amount ?? "";

      return {
        qty,
        invoice_class: itemClass,
        item: codeMatch ? codeMatch.entry.itemCode : "",
        description,
        rate: deriveRate(amount, qty),
        amount,
        confidence: item.confidence ?? 0,
        class: itemClass,
        candidates: candidates.map((c) => ({
          description: c.entry.salesDesc,
          itemCode: c.entry.itemCode,
          score: c.score,
        })),
      };
    });

    // Waitress is kept as its own field through extraction and the
    // verification form -- it only gets folded into Memo at the point of
    // actually writing a sheet row (lib/salesOrderRows.ts), since Memo is
    // the only column available for it, not before.
    const memberStatus = raw.member_status === "Member" || raw.member_status === "Non-Member" ? raw.member_status : "";

    const extraction: OrderSlipExtraction = {
      customer_written: raw.customer_written ?? "",
      customer_suggested: "",
      waitress: (raw.waitress_written ?? "").trim(),
      slip_type: slipType,
      member_status: memberStatus,
      order_slip_date: raw.order_slip_date ?? "",
      order_slip_number: raw.order_slip_number ?? "",
      terms: raw.terms ?? "",
      memo: raw.memo ?? "",
      items,
      overall_confidence: raw.overall_confidence ?? 0,
      uncertain_fields: uncertainFields,
    };

    // Always fetch the customer list (the verification screen needs it for
    // its dropdown even when the handwriting couldn't be read at all).
    try {
      const customerRows = await readTab("Customers");
      const names = customerRows.map((row) => row[0]).filter((name): name is string => Boolean(name?.trim()));
      extraction.customer_list = names;

      if (extraction.customer_written) {
        const matches = matchCustomer(extraction.customer_written, names);
        extraction.customer_matches = matches;
        extraction.customer_suggested =
          matches[0] && matches[0].score >= CUSTOMER_MATCH_THRESHOLD ? matches[0].name : "";
      }
    } catch {
      // Customer lookup failing shouldn't block the extraction — the user
      // can still type the name manually on the verification screen.
      extraction.customer_matches = [];
      extraction.customer_list = [];
    }

    return NextResponse.json({ ok: true, extraction });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
