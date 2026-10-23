import type { StoredEvent } from "@traceframe/schema";
import {
  COST_CATEGORIES,
  COST_FORMULA,
  COST_RULE,
  COST_UNCERTAINTY,
  type CostCategory,
  type CostCategoryEstimate,
  type CostEstimate,
  type CostReason,
  type CostRequestEstimate,
  type PriceCatalog,
  type PriceModel,
  priceCatalogSchema,
} from "@traceframe/schema/cost";
import { groupUsage } from "./usage";

const MILLION = 1_000_000n;

/** Rounds half-up to whole micros; null when the result leaves safe-integer range. */
function subtotal(tokens: number, rate: number): number | null {
  const micros = (BigInt(tokens) * BigInt(rate) + MILLION / 2n) / MILLION;
  return micros <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(micros) : null;
}

function matchModel(
  catalog: PriceCatalog,
  model: string,
  provider: string | null,
  date: string,
): PriceModel | "unknown" | "ambiguous" {
  const matches = catalog.models.filter(
    (entry) =>
      (entry.canonical === model || entry.aliases.includes(model)) &&
      (entry.provider === null || entry.provider === provider) &&
      date >= entry.effectiveFrom &&
      (entry.effectiveTo === null || date < entry.effectiveTo),
  );
  if (matches.length === 0) return "unknown";
  if (matches.length > 1) return "ambiguous";
  return matches[0];
}

function unpricedCategories(event: StoredEvent, reason: CostReason): CostCategoryEstimate[] {
  if (event.payload.kind !== "usage") return [];
  const payload = event.payload;
  return COST_CATEGORIES.map((category) => ({
    category,
    tokens: payload[category] ?? null,
    microsPerMillionTokens: null,
    subtotalMicros: null,
    reason,
  }));
}

/**
 * Prices resolved request deltas against an effective-dated catalog.
 *
 * Only identified request deltas are priced: a cumulative counter has no
 * per-request date, so pricing it at one rate would invent a date boundary.
 * Conflicting observations are not priced. A partial total sums priced inputs
 * only and is labelled partial.
 */
export function estimateCost(events: StoredEvent[], catalog: PriceCatalog): CostEstimate {
  const parsed = priceCatalogSchema.parse(catalog);
  const groups = groupUsage(events);
  const requests: CostRequestEstimate[] = groups.requests.map((group) => {
    const event = group.events[0];
    if (event.payload.kind !== "usage") throw new Error("usage group lost its usage payload");
    const payload = event.payload;
    const provider = payload.provider ?? null;
    const date = event.sourceTime ? event.sourceTime.slice(0, 10) : null;
    const base = {
      eventId: event.id,
      requestId: event.requestId ?? "",
      model: payload.model,
      provider,
      sourceTime: event.sourceTime,
      reportedCostUsdMicros: payload.costUsdMicros ?? null,
    };
    if (group.conflict)
      return {
        ...base,
        catalogModel: null,
        categories: [],
        subtotalMicros: null,
        state: "unpriced",
        reason: "conflicting_usage",
      };
    if (parsed.currency === null)
      return {
        ...base,
        catalogModel: null,
        categories: unpricedCategories(event, "unknown_currency"),
        subtotalMicros: null,
        state: "unpriced",
        reason: "unknown_currency",
      };
    if (date === null)
      return {
        ...base,
        catalogModel: null,
        categories: unpricedCategories(event, "missing_date"),
        subtotalMicros: null,
        state: "unpriced",
        reason: "missing_date",
      };
    const match = matchModel(parsed, payload.model, provider, date);
    if (match === "unknown" || match === "ambiguous")
      return {
        ...base,
        catalogModel: null,
        categories: unpricedCategories(
          event,
          match === "unknown" ? "unknown_model" : "ambiguous_model",
        ),
        subtotalMicros: null,
        state: "unpriced",
        reason: match === "unknown" ? "unknown_model" : "ambiguous_model",
      };
    const categories = COST_CATEGORIES.map((category: CostCategory) => {
      const tokens = payload[category] ?? null;
      const rate = match.rates[category];
      if (tokens === null)
        return {
          category,
          tokens,
          microsPerMillionTokens: rate,
          subtotalMicros: null,
          reason: "missing_tokens" as const,
        };
      if (tokens === 0)
        return { category, tokens, microsPerMillionTokens: rate, subtotalMicros: 0, reason: null };
      if (rate === null)
        return {
          category,
          tokens,
          microsPerMillionTokens: null,
          subtotalMicros: null,
          reason: "missing_rate" as const,
        };
      const micros = subtotal(tokens, rate);
      return {
        category,
        tokens,
        microsPerMillionTokens: rate,
        subtotalMicros: micros,
        reason: micros === null ? ("overflow" as const) : null,
      };
    });
    let total = 0n;
    let priced = 0;
    for (const category of categories) {
      if (category.subtotalMicros === null) continue;
      total += BigInt(category.subtotalMicros);
      priced++;
    }
    const subtotalMicros =
      priced === 0 ? null : total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
    const firstReason = categories.find((category) => category.reason !== null)?.reason ?? null;
    return {
      ...base,
      catalogModel: match.canonical,
      categories,
      subtotalMicros,
      state:
        subtotalMicros === null
          ? "unpriced"
          : categories.every((category) => category.subtotalMicros !== null)
            ? "priced"
            : "partial",
      reason:
        subtotalMicros === null
          ? (firstReason ?? "overflow")
          : categories.every((category) => category.subtotalMicros !== null)
            ? null
            : firstReason,
    };
  });

  let total = 0n;
  let priced = 0;
  for (const request of requests) {
    if (request.subtotalMicros === null) continue;
    total += BigInt(request.subtotalMicros);
    priced++;
  }
  const totalMicros =
    priced === 0 ? null : total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
  const allPriced = requests.length > 0 && requests.every((request) => request.state === "priced");
  const state: CostEstimate["state"] =
    priced === 0 ? "unpriced" : totalMicros === null || !allPriced ? "partial" : "complete";
  return {
    rule: COST_RULE,
    catalogVersion: parsed.version,
    currency: parsed.currency,
    state,
    totalMicros,
    requests,
    unpricedRequests: requests.filter((request) => request.state === "unpriced").length,
    omittedUsageObservations:
      groups.omitted +
      [...groups.counters.values()].reduce((count, observations) => count + observations.length, 0),
    formula: COST_FORMULA,
    uncertainty: COST_UNCERTAINTY,
  };
}
