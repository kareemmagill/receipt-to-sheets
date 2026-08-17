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
