import { z } from "zod";
import { safeId } from "./index";

/**
 * Effective-dated list-price catalog (V16).
 *
 * Prices are integer micro-currency units per million tokens, so an estimate
 * needs no floating-point arithmetic. A catalog is single-currency; there is
 * no conversion. The catalog version is carried into every estimate so an
 * older estimate stays explainable after the catalog changes.
 */

export const COST_RULE = "list-price-usage/v1";
export const COST_FORMULA =
  "sum over priced requests and categories of round(tokens * microsPerMillionTokens / 1_000_000) micros, half-up per category";
export const COST_UNCERTAINTY =
  "List-price estimate from the named catalog version. It is not a provider invoice or a subscription cost; unpriced and partial inputs stay visible.";

export const COST_CATEGORIES = ["input", "output", "cacheRead", "cacheWrite", "reasoning"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

const modelName = z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/);
const micros = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const priceRatesSchema = z
  .object({
    input: micros.nullable(),
    output: micros.nullable(),
    cacheRead: micros.nullable(),
    cacheWrite: micros.nullable(),
    reasoning: micros.nullable(),
  })
  .strict();
export type PriceRates = z.infer<typeof priceRatesSchema>;

export const priceModelSchema = z
  .object({
    canonical: modelName,
    aliases: z.array(modelName).max(20).default([]),
    provider: safeId.nullable(),
    effectiveFrom: z.iso.date(),
    effectiveTo: z.iso.date().nullable(),
    rates: priceRatesSchema,
  })
  .strict()
  .refine((model) => !model.effectiveTo || model.effectiveTo > model.effectiveFrom, {
    message: "effectiveTo must be after effectiveFrom",
    path: ["effectiveTo"],
  });
export type PriceModel = z.infer<typeof priceModelSchema>;

export const priceCatalogSchema = z
  .object({
    version: safeId,
    // Null is an explicit unknown currency: estimates stay unpriced.
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    models: z.array(priceModelSchema).min(1),
  })
  .strict();
export type PriceCatalog = z.infer<typeof priceCatalogSchema>;

export type CostReason =
  | "conflicting_usage"
  | "missing_date"
  | "unknown_model"
  | "ambiguous_model"
  | "unknown_currency"
  | "missing_tokens"
  | "missing_rate"
  | "overflow";

export type CostCategoryEstimate = {
  category: CostCategory;
  tokens: number | null;
  microsPerMillionTokens: number | null;
  subtotalMicros: number | null;
  reason: CostReason | null;
};

export type CostRequestEstimate = {
  eventId: string;
  requestId: string;
  model: string;
  provider: string | null;
  sourceTime: string | null;
  catalogModel: string | null;
  categories: CostCategoryEstimate[];
  subtotalMicros: number | null;
  /** Provider-reported amount, kept separate from the list-price estimate. */
  reportedCostUsdMicros: number | null;
  state: "priced" | "partial" | "unpriced";
  reason: CostReason | null;
};

export type CostEstimate = {
  rule: typeof COST_RULE;
  catalogVersion: string;
  currency: string | null;
  state: "complete" | "partial" | "unpriced";
  totalMicros: number | null;
  requests: CostRequestEstimate[];
  unpricedRequests: number;
  omittedUsageObservations: number;
  formula: string;
  uncertainty: string;
};
