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
const ENDPOINT_COL = 1;
const MODEL_COL = 2;
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

export interface ModelUsage {
  model: string;
  // Distinct endpoints this model has actually been called from, in
  // first-seen order -- drives the "what's this for" label in the UI
  // without hardcoding a model->purpose map that would need updating
  // whenever the model behind an endpoint changes (Kareem, 2026-08-19:
  // "i will change to Haiku later").
  endpoints: string[];
  callCount: number;
  costUsd: number;
}

export interface ApiUsageSummary {
  totalCostUsd: number;
  // "extract" calls specifically -- one per slip scanned (Kareem,
  // 2026-08-18: "number of slips scanned... current price per scan").
  // Separate from query-endpoint cost since Ask the Sales Data isn't
  // scanning anything.
  scanCount: number;
  scanCostUsd: number;
  // Per-model breakdown for the expandable cost detail (Kareem,
  // 2026-08-19: "expands to the usage for the 3 models") -- grows on its
  // own as new model names show up in logged rows, e.g. once extraction
  // switches to Haiku both it and the historical Sonnet rows still show
  // up correctly.
  byModel: ModelUsage[];
}

/** Running totals across every logged call so far. */
export async function apiUsageSummary(): Promise<ApiUsageSummary> {
  try {
    const rows = await readTab(API_USAGE_TAB);
    let totalCostUsd = 0;
    let scanCount = 0;
    let scanCostUsd = 0;
    const byModelMap = new Map<string, ModelUsage>();

    for (const row of rows.slice(1)) {
      const cost = parseFloat(row[COST_COL]) || 0;
      const endpoint = (row[ENDPOINT_COL] ?? "").trim();
      const model = (row[MODEL_COL] ?? "").trim();

      totalCostUsd += cost;
      if (endpoint === "extract") {
        scanCount += 1;
        scanCostUsd += cost;
      }

      if (model) {
        const existing = byModelMap.get(model);
        if (existing) {
          existing.callCount += 1;
          existing.costUsd += cost;
          if (endpoint && !existing.endpoints.includes(endpoint)) existing.endpoints.push(endpoint);
        } else {
          byModelMap.set(model, { model, endpoints: endpoint ? [endpoint] : [], callCount: 1, costUsd: cost });
        }
      }
    }

    return { totalCostUsd, scanCount, scanCostUsd, byModel: [...byModelMap.values()] };
  } catch {
    return { totalCostUsd: 0, scanCount: 0, scanCostUsd: 0, byModel: [] }; // tab doesn't exist yet -- nothing logged
  }
}
