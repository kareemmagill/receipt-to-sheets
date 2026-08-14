import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ORDER_SLIP_SCHEMA, type OrderSlipExtraction, type OrderSlipItem } from "@/lib/extractSchema";
import { readTab } from "@/lib/googleSheets";
import { matchCustomer } from "@/lib/customerMatch";
import { loadItemCodeTemplate, matchItemCode, guessClass, ITEM_MATCH_CONFIDENT_THRESHOLD } from "@/lib/itemCodeMatch";

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
- "order_slip_number" is the slip's own number, usually printed in the top-right corner following a label like "NO" or "NO.". Don't confuse it with an AR number, table number, or phone number.
- If a "Non-Member" checkbox/marking is ticked on the slip, set "customer_written" to exactly "DIRECT SALES- WALK IN" (the club's account for walk-in/non-member sales), regardless of any other name written on the slip.
- "terms" must be exactly "COD" or "CREDIT" (or an empty string if you can't tell): look for an explicit written word ("COD", "Credit", "Charge"), a checked/circled box, or another clear marking distinguishing a member charge account (CREDIT) from a cash-paid order (COD).
- On these slips, Amount = Rate × QTY for each line. If exactly one of "rate" or "amount" is illegible or missing but the other one and "qty" are both clearly legible, you may compute the missing value from that relationship instead of leaving it blank. Do not do this if two or more of the three values are unclear — leave those blank rather than guessing.
- For each item line, set "confidence" between 0 and 1 for how sure you are of that line's reading.
- Set "overall_confidence" between 0 and 1 for the whole extraction.
- List the names of any fields you are unsure about in "uncertain_fields" (e.g. "order_slip_date", "items[1].rate").

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
  invoice_class?: string;
  description?: string;
  rate?: string;
  amount?: string;
  confidence?: number;
}

interface RawVisionExtraction {
  customer_written?: string;
  order_slip_date?: string;
  order_slip_number?: string;
  terms?: string;
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
      const codeMatch = matchItemCode(description, itemTemplate);

      if (!codeMatch) {
        uncertainFields.push(`items[${index}].item (no confident code match — check manually)`);
      } else if (codeMatch.score < ITEM_MATCH_CONFIDENT_THRESHOLD) {
        uncertainFields.push(`items[${index}].item (partial code match — please verify)`);
      }

      return {
        qty: item.qty ?? "",
        invoice_class: item.invoice_class ?? "",
        item: codeMatch ? codeMatch.entry.itemCode : "",
        description,
        rate: item.rate ?? "",
        amount: item.amount ?? "",
        confidence: item.confidence ?? 0,
        class: guessClass(description, codeMatch?.entry.category),
      };
    });

    const extraction: OrderSlipExtraction = {
      customer_written: raw.customer_written ?? "",
      customer_suggested: "",
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
