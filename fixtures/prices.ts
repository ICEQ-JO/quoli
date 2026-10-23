import type { PriceCatalog } from "../packages/schema/src/cost";

// Synthetic catalog for tests and documentation examples. The model names and
// amounts are invented; no real provider price is claimed or shipped here.
export const syntheticPriceCatalog: PriceCatalog = {
  version: "synthetic-2026-01",
  currency: "USD",
  models: [
    {
      canonical: "synthetic-alpha",
      aliases: ["synthetic-alpha-2026-01", "alpha"],
      provider: null,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-07-01",
      rates: {
        input: 15_000_000,
        output: 75_000_000,
        cacheRead: 1_500_000,
        cacheWrite: 18_750_000,
        reasoning: 75_000_000,
      },
    },
    {
      canonical: "synthetic-alpha",
      aliases: ["synthetic-alpha-2026-07"],
      provider: null,
      effectiveFrom: "2026-07-01",
      effectiveTo: null,
      rates: {
        input: 10_000_000,
        output: 50_000_000,
        cacheRead: 1_000_000,
        cacheWrite: 12_500_000,
        reasoning: 50_000_000,
      },
    },
    {
      canonical: "synthetic-beta",
      aliases: [],
      provider: null,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      rates: {
        input: 3_000_000,
        output: 15_000_000,
        cacheRead: 300_000,
        cacheWrite: 3_750_000,
        reasoning: null,
      },
    },
    {
      canonical: "synthetic-gamma",
      aliases: ["shared-alias"],
      provider: null,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      rates: {
        input: 1_000_000,
        output: 5_000_000,
        cacheRead: 100_000,
        cacheWrite: 1_250_000,
        reasoning: 5_000_000,
      },
    },
    {
      canonical: "synthetic-delta",
      aliases: ["shared-alias"],
      provider: null,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      rates: {
        input: 2_000_000,
        output: 10_000_000,
        cacheRead: 200_000,
        cacheWrite: 2_500_000,
        reasoning: 10_000_000,
      },
    },
    {
      canonical: "synthetic-epsilon",
      aliases: ["provider-only"],
      provider: "provider-one",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      rates: {
        input: 4_000_000,
        output: 20_000_000,
        cacheRead: 400_000,
        cacheWrite: 5_000_000,
        reasoning: 20_000_000,
      },
    },
  ],
};
