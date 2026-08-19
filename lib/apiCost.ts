// Tracks an estimate of what this app's Claude API calls have cost, based
// on each response's own token usage x public per-model pricing -- there's
// no billing API wired up (that needs a separate admin-level key this
// project doesn't have), so this is a running estimate computed from
// actual usage, not a pull from Anthropic's real invoiced numbers. Should
// track real spend closely for a single-org account with no volume
// discounts, which is the case here.

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  // Multipliers are Anthropic's standard prompt-caching rates (verified
  // 2026-08-17): a 5-minute cache write costs 1.25x base input, a cache
  // read costs 0.1x base input. Both routes that call the API use the
  // default 5-minute ephemeral cache, not the 1-hour variant (2x), so
  // that's the only write rate modeled here.
  cacheWritePerMillion: number;
  cacheReadPerMillion: number;
}

// Sonnet 5 intro pricing ($2/$10 per MTok) runs through 2026-08-31 --
// after that it reverts to $3/$15. Update SONNET_5_STANDARD below to take
// over automatically; nothing else needs to change.
const SONNET_5_INTRO_END = new Date("2026-09-01T00:00:00Z").getTime();
const SONNET_5_INTRO = { input: 2.0, output: 10.0 };
const SONNET_5_STANDARD = { input: 3.0, output: 15.0 };

function withCacheMultipliers(input: number, output: number): ModelPricing {
  return {
    inputPerMillion: input,
    outputPerMillion: output,
    cacheWritePerMillion: input * 1.25,
    cacheReadPerMillion: input * 0.1,
  };
}

function sonnet5Pricing(): ModelPricing {
  const { input, output } = Date.now() < SONNET_5_INTRO_END ? SONNET_5_INTRO : SONNET_5_STANDARD;
  return withCacheMultipliers(input, output);
}

const OPUS_5_PRICING = withCacheMultipliers(5.0, 25.0);

export function pricingForModel(model: string): ModelPricing | null {
  if (model === "claude-sonnet-5") return sonnet5Pricing();
  if (model === "claude-opus-5") return OPUS_5_PRICING;
  return null; // unknown model -- caller should skip logging cost for it
}

export interface ApiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export function costForUsage(model: string, usage: ApiUsage): number | null {
  const pricing = pricingForModel(model);
  if (!pricing) return null;
  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillion +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillion +
    (usage.cacheCreationInputTokens / 1_000_000) * pricing.cacheWritePerMillion +
    (usage.cacheReadInputTokens / 1_000_000) * pricing.cacheReadPerMillion
  );
}

// Hand-set average, deliberately not a live exchange-rate feed -- Kareem,
// 2026-08-19: "im ok to average the USD1 = PHP60 so no need for realtime".
// Anthropic bills in USD; this is purely a display conversion for
// Kareem's own reference. Update this if it drifts far from the real
// rate (was 58 as of 2026-08-18).
export const USD_TO_PHP_RATE = 60;

// Vercel Hobby plan + Google Sheets/Drive APIs, both free at this app's
// current volume -- ₱0 for now (Kareem, 2026-08-19). In PHP directly, not
// USD-converted -- Kareem: "all in PHP" -- so a real figure later can be
// entered as whatever he's actually billed, with no round-trip fx
// assumption. Update the day any of that changes (e.g. upgrading off
// Vercel's free tier). Only read by app/costs/page.tsx.
export const HOSTING_COST_PHP_PER_MONTH = 0;

// What "projected monthly cost" on the costs page assumes: 500 order
// slips/month, extrapolated from whichever AI model(s) are actually
// logged right now (real measured per-scan average, not a hypothetical
// list-price calculation). Kareem, 2026-08-19: "projected monthly costs
// based on 500 chits, while using the existing AI models... i will be
// adapting and investigating the accuracy of them later" -- update this
// if the expected volume assumption changes.
export const PROJECTED_MONTHLY_SLIPS = 500;

// Vercel Pro plan -- $20/month base, verified against vercel.com/pricing
// (2026-08-19: 1M function invocations + 1TB bandwidth included, both far
// beyond what ~1000 slips/month actually generates -- see the costs page
// for the math). Vercel's own Hobby-plan FAQ explicitly restricts it to
// "personal, non-commercial use" -- PGYC is a business, so staying on
// Hobby is against Vercel's terms regardless of whether usage happens to
// fit the free tier's resource limits. In USD (a real known list price,
// unlike the hand-entered PHP figures above) -- converted for display via
// USD_TO_PHP_RATE. Shown on the costs page as a recommendation only --
// nothing has actually been upgraded (Kareem, 2026-08-19: "can you add
// that to the costs page, making it clear, this is an option only").
export const VERCEL_PRO_COST_USD_PER_MONTH = 20;

// What Kareem has personally paid for Claude Code usage building this app
// -- a one-time development cost, separate from (and not part of) the
// app's own ongoing runtime API/hosting spend above, so it's shown on its
// own and deliberately excluded from the projected-monthly-cost math
// (Kareem, 2026-08-19: "add an AI development cost, i.e. what i have paid
// for use of claude to this list"). Real Console usage data couldn't
// cleanly separate Kareem's own Claude Code usage from the app's own
// production API traffic (same account/models), so this uses one month
// of Claude Pro ($20/month, verified against claude.com/pricing
// 2026-08-19 -- the monthly-billed rate, not the $17/mo annual-commitment
// rate) as a stand-in proxy instead (Kareem: "lets just factor in one
// month of claude pro as the development cost"). In PHP, same "all in
// PHP" reasoning as HOSTING_COST_PHP_PER_MONTH above.
export const DEVELOPMENT_COST_PHP: number | null = 20 * USD_TO_PHP_RATE;
