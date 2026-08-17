import { NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ORDER_SLIP_SCHEMA, type OrderSlipExtraction, type OrderSlipItem, type UncertainField } from "@/lib/extractSchema";
import { readTab } from "@/lib/googleSheets";
import { matchCustomer } from "@/lib/customerMatch";
import { waitressNamesFromRows, walkInNamesFromRows } from "@/lib/knownNames";
import { itemCorrectionsFromRows } from "@/lib/itemCorrections";
import { logApiUsage } from "@/lib/apiUsageLog";
import { normalizeDate, mostRecentOrderDate } from "@/lib/dateNormalize";
import {
  itemCodeTemplateFromRows,
  matchItemCodeCandidates,
  guessClass,
  ITEM_MATCH_CONFIDENT_THRESHOLD,
  type ItemCodeEntry,
} from "@/lib/itemCodeMatch";

const client = new Anthropic();

// A match below this score is too weak to auto-suggest — the raw
// handwriting is shown instead and the user picks manually.
const CUSTOMER_MATCH_THRESHOLD = 0.5;
// Same idea for waitress names against past saves -- see lib/knownNames.ts.
const WAITRESS_MATCH_THRESHOLD = 0.5;

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
- "Customer:" and "Waitress:" are two separate printed, labeled lines, one right below the other — read whatever is written on each independently. "Waitress:" is sometimes left blank on real slips (the server is instead identified only by an illegible signature near "Waiter/Waitress" at the bottom); if its line has no legible name written on it, set "waitress_written" to an empty string.
- "terms" must be exactly "COD" or "CREDIT" (or an empty string if you can't tell): look for an explicit written word ("COD", "Credit", "Charge"), a checked/circled box, or another clear marking distinguishing a member charge account (CREDIT) from a cash-paid order (COD).
- Set "member_status" to "Member" or "Non-Member" based on the slip's Member/Non-Member checkbox or marking (separately from whatever you set "customer_written" to — report this even when a name is legible).
- The single number written after an item's description is its line total ("amount") — these slips don't have a separate per-unit rate column, so don't try to read one; the app computes it from amount ÷ qty.
- For each item line, set "confidence" between 0 and 1 for how sure you are of that line's reading.
- Set "overall_confidence" between 0 and 1 for the whole extraction.
- For any field you're not fully confident about, add it to "uncertain_fields" as {field, confidence} -- e.g. {"field": "order_slip_date", "confidence": 0.6}, {"field": "items[1].amount", "confidence": 0.15}. Omit fields you're confident about entirely; don't list every field.

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
  uncertain_fields?: UncertainField[];
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
      model: "claude-sonnet-5",
      max_tokens: 8000,
      // Sonnet 5 defaults to adaptive thinking when this is omitted -- same
      // failure mode confirmed on the /api/query route (2026-08-16):
      // thinking can consume the whole max_tokens budget before any actual
      // output, leaving nothing for the extraction JSON. Reading a single
      // photo against a fixed schema doesn't benefit from open-ended
      // reasoning, so it's switched off outright.
      thinking: { type: "disabled" },
      // Cached: this ~40-line rules block is identical on every scan, and
      // slips get scanned in bursts during service -- caching means only
      // the first scan in a cache window (5 min TTL) pays to process it,
      // cutting both latency and cost on every scan after that.
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
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

    // Best-effort cost logging, deferred so it never adds to the wait --
    // the reviewer doesn't need this to see their extraction (Kareem,
    // 2026-08-17: running API cost total on the home page).
    after(async () => {
      try {
        await logApiUsage("extract", "claude-sonnet-5", {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
        });
      } catch {
        // Best-effort; nothing user-facing depends on it.
      }
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
    const uncertainFields: UncertainField[] = [...(raw.uncertain_fields ?? [])];

    // The physical slip form (Bar vs Restaurant) is a stronger signal than
    // guessing Class from an individual item's name, so it takes priority
    // when the model could read the heading.
    const slipType = raw.slip_type === "Bar" || raw.slip_type === "Restaurant" ? raw.slip_type : "";
    if (!slipType) {
      // No real confidence signal for this one (there's nothing to score --
      // the heading just wasn't legible at all), so a fixed low value.
      uncertainFields.push({ field: "slip_type", confidence: 0.2 });
    }

    // Fetch every sheet this endpoint needs exactly once, all in parallel --
    // previously Sales Orders alone was read three separate times (once
    // each for item corrections, walk-in names, waitress names), each a
    // full round trip to Google for identical data. Promise.allSettled (not
    // Promise.all) so one tab failing doesn't block extraction on the
    // others -- each consumer below still degrades to an empty list on its
    // own, same as before.
    const [salesOrdersResult, inventoryResult, customersResult] = await Promise.allSettled([
      readTab("Sales Orders"),
      readTab("Inventory"),
      readTab("Customers"),
    ]);
    const salesOrderRows = salesOrdersResult.status === "fulfilled" ? salesOrdersResult.value : [];

    // Look up an item code + Restaurant/Bar class for each line, matching
    // against past corrections first (see lib/itemCorrections.ts -- an
    // exact repeat of previously-corrected handwriting scores 1.0 there)
    // and the live Item Code Template tab. A missing read shouldn't block
    // the whole extraction — items just come back uncoded for manual entry.
    let itemTemplate: ItemCodeEntry[] = [];
    try {
      const template = inventoryResult.status === "fulfilled" ? itemCodeTemplateFromRows(inventoryResult.value) : [];
      const corrections = itemCorrectionsFromRows(salesOrderRows);
      itemTemplate = [...corrections, ...template];
    } catch {
      // fall through with an empty template
    }

    const items: OrderSlipItem[] = (raw.items ?? []).map((item, index) => {
      const description = item.description ?? "";
      const candidates = matchItemCodeCandidates(description, itemTemplate, 5);
      // Only a fully confident match gets auto-filled -- anything less is
      // left blank (and flagged) rather than pre-filling a guess that
      // might be wrong and go unnoticed. The candidate chips (see
      // components/VerificationForm.tsx) are how the user picks or types
      // the real one, and that correction becomes a known pairing itself
      // the next time this same handwriting comes up.
      const codeMatch = candidates[0] && candidates[0].score >= ITEM_MATCH_CONFIDENT_THRESHOLD ? candidates[0] : null;

      if (!codeMatch) {
        // Real signal available here (unlike slip_type above) -- the
        // fuzzy-match score itself, not a guess.
        uncertainFields.push({ field: `items[${index}].item`, confidence: candidates[0]?.score ?? 0 });
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
        original_description: description,
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
    // Defaults to Non-Member when the checkbox itself isn't legible --
    // never leaves it blank (real bug, Kareem, 2026-08-17: slip #34899's
    // Member/Non-Member marking was unclear, which left member_status ""
    // and silently routed the Customer field through the Member-matching
    // branch below instead of just trusting the OCR read; "Jenny" wasn't
    // a registered Member so nothing matched and Customer Name showed
    // blank even though the handwriting itself read fine). Defaulting to
    // Non-Member is also the safer guess either way -- it forces Payment
    // to stay COD (see VerificationForm's enforcePaymentRule) rather than
    // risking an unconfirmed Member getting waved through on credit.
    const memberStatus = raw.member_status === "Member" ? "Member" : "Non-Member";
    if (raw.member_status !== "Member" && raw.member_status !== "Non-Member") {
      uncertainFields.push({ field: "member_status", confidence: 0.2 });
    }

    const extraction: OrderSlipExtraction = {
      customer_written: raw.customer_written ?? "",
      customer_suggested: "",
      waitress: (raw.waitress_written ?? "").trim(),
      slip_type: slipType,
      member_status: memberStatus,
      // Normalized here (not just at save time) using the real reference
      // date from the sheet -- the verification screen used to normalize
      // this itself client-side with no reference date on hand at all
      // (there's no sheet data in the browser), so the year-sanity check
      // in normalizeDate never had anything to compare against and a
      // misread year like "2020" instead of "2026" showed on screen
      // exactly as OCR read it, only getting caught later at save time
      // (real gap, Kareem, 2026-08-17: "the date is still wrong").
      order_slip_date: normalizeDate(raw.order_slip_date ?? "", mostRecentOrderDate(salesOrderRows)),
      order_slip_number: raw.order_slip_number ?? "",
      terms: raw.terms ?? "",
      memo: raw.memo ?? "",
      items,
      overall_confidence: raw.overall_confidence ?? 0,
      uncertain_fields: uncertainFields,
    };

    // Always fetch the customer list (the verification screen needs it for
    // its dropdown even when the handwriting couldn't be read at all).
    // Fetches both real members and past walk-in names unconditionally,
    // regardless of member_status -- previously only one side was ever
    // fetched, so member names could keep showing after correcting
    // Member -> Non-Member on the verification screen (real bug, found
    // 2026-08-15). Non-members are never matched against the Customers
    // tab (never suggest a real member as a walk-in); walk-in matching is
    // self-correcting -- fixing a misread walk-in name once makes it a
    // known name next time (see lib/knownNames.ts).
    try {
      const customerRows = customersResult.status === "fulfilled" ? customersResult.value : [];
      extraction.customer_list = customerRows
        .map((row) => row[0])
        .filter((name): name is string => Boolean(name?.trim()));
      if (extraction.customer_written) {
        extraction.customer_matches = matchCustomer(extraction.customer_written, extraction.customer_list);
      }
    } catch {
      // Customer lookup failing shouldn't block the extraction — the user
      // can still type the name manually on the verification screen.
      extraction.customer_matches = [];
      extraction.customer_list = [];
    }

    try {
      // No fuzzy matching against customer_written here -- the reviewer
      // gets suggestions only once they're actually typing (client-side
      // substring filter against this list, see walkInFieldTyped in
      // components/VerificationForm.tsx), not from the original OCR read.
      extraction.walkin_list = walkInNamesFromRows(salesOrderRows);
    } catch {
      extraction.walkin_list = [];
    }

    // One-time pre-filled guess for the free-text field -- not re-derived
    // if member_status is corrected afterward (the suggestion list the
    // form shows does update live; see components/VerificationForm.tsx).
    if (memberStatus === "Non-Member") {
      // Always the raw reading, never substituted with a fuzzy-matched
      // past walk-in -- a walk-in isn't a fixed roster, so a clear OCR
      // read is trustworthy even for a name never seen before. Matching
      // loosely against past names here was overriding a clean read with
      // an unrelated one that just happened to share a few letters (real
      // bug, Kareem, 2026-08-17: OCR clearly read "Martin", this
      // auto-suggested "Ms Lin" instead -- crude edit-distance similarity
      // alone scored that a coincidental 50%, above the old threshold).
      // Past-name suggestions are still offered, but only once the
      // reviewer is actually typing (see walkin_list/walkin_matches below
      // and components/VerificationForm.tsx's walkInFieldTyped).
      extraction.customer_suggested = extraction.customer_written;
    } else if (extraction.customer_written) {
      const matches = extraction.customer_matches ?? [];
      extraction.customer_suggested = matches[0] && matches[0].score >= CUSTOMER_MATCH_THRESHOLD ? matches[0].name : "";
    }

    // Same idea for the waitress name -- auto-correct to a known name when
    // confident, and always send the full list + scored matches so the
    // form can offer it as a pick, not just free text.
    try {
      const waitressNames = waitressNamesFromRows(salesOrderRows);
      extraction.waitress_list = waitressNames;
      if (extraction.waitress) {
        const matches = matchCustomer(extraction.waitress, waitressNames);
        extraction.waitress_matches = matches;
        if (matches[0] && matches[0].score >= WAITRESS_MATCH_THRESHOLD) {
          extraction.waitress = matches[0].name;
        }
      }
    } catch {
      extraction.waitress_matches = [];
      extraction.waitress_list = [];
    }

    // Sent back alongside the extraction so the verification form can
    // re-match item codes client-side as the description is retyped,
    // without a network round-trip per keystroke or re-reading the sheet.
    return NextResponse.json({ ok: true, extraction, itemTemplate });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
