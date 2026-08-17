import { readTab, ensureTabExists, appendRows } from "./googleSheets";
import { costForUsage, type ApiUsage } from "./apiCost";

const API_USAGE_TAB = "API Usage";
const API_USAGE_HEADER = [
  "Timestamp",
  "Endpoint",
  "Model",
  "Input Tokens",
  "Output Tokens",
  "Cache Write Tokens",
  "Cache Read Tokens",
  "Cost (USD)",
];
const COST_COL = 7;

/**
 * One row per API call -- append-only, same pattern as Photo Log, so the
 * running total (see totalApiCost below) is just a sum over real logged
 * calls rather than an unsafe read-modify-write counter that two
 * concurrent requests could race on.
 */
export async function logApiUsage(endpoint: string, model: string, usage: ApiUsage) {
  const cost = costForUsage(model, usage);
  if (cost === null) return; // unknown model -- nothing to price, skip logging

  await ensureTabExists(API_USAGE_TAB, API_USAGE_HEADER);
  await appendRows(API_USAGE_TAB, [
    [
      new Date().toISOString(),
      endpoint,
      model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheCreationInputTokens,
      usage.cacheReadInputTokens,
      cost,
    ],
  ]);
}

/** Running total in USD across every logged call so far. */
export async function totalApiCost(): Promise<number> {
  try {
    const rows = await readTab(API_USAGE_TAB);
    return rows.slice(1).reduce((sum, row) => sum + (parseFloat(row[COST_COL]) || 0), 0);
  } catch {
    return 0; // tab doesn't exist yet -- nothing logged
  }
}
