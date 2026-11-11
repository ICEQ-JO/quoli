import type { Cost, ModelPrice, PriceTable, TokenTotals } from "../shared/model.ts";
import type { Store } from "./db.ts";

/** [model, input, output, cacheRead, cacheWrite] in USD per million tokens. */
const ROWS: [string, number, number, number, number][] = [
  ["claude-fable-5-2", 8, 40, 0.2, 10],
  ["claude-fable-5-1", 10, 50, 1, 12.5],
  ["claude-fable-5", 10, 50, 1, 12.5],
  ["claude-opus-5-5", 4, 20, 0.2, 5],
  ["claude-opus-5", 5, 25, 0.5, 6.25],
  ["claude-opus-4-8", 5, 25, 0.5, 6.25],
  ["claude-opus-4-7", 5, 25, 0.5, 6.25],
  ["claude-opus-4-6", 5, 25, 0.5, 6.25],
  ["claude-opus-4-5", 5, 25, 0.5, 6.25],
  ["claude-opus-4-1", 15, 75, 1.5, 18.75],
  ["claude-opus-4", 15, 75, 1.5, 18.75],
  ["claude-sonnet-5-5", 2, 10, 0.1, 2.5],
  ["claude-sonnet-5", 2, 10, 0.2, 2.5],
  ["claude-sonnet-4-6", 3, 15, 0.3, 3.75],
  ["claude-sonnet-4-5", 3, 15, 0.3, 3.75],
  ["claude-sonnet-4", 3, 15, 0.3, 3.75],
  ["claude-haiku-5-5", 0.1, 0.5, 0.01, 0.125],
  ["claude-haiku-4-5", 1, 5, 0.1, 1.25],
];

export const defaultPrices = (): PriceTable => ({
  version:
    "Anthropic list prices as of 2026-11-03; cache writes and older cache reads derived (read 0.1× input, write 1.25× input)",
  currency: "USD",
  prices: ROWS.map(([model, input, output, cacheRead, cacheWrite]) => ({
    model,
    input,
    output,
    cacheRead,
    cacheWrite,
  })),
});

/** Exact model id first, then the longest price `model` that prefixes it. */
export function priceFor(model: string, table: PriceTable): ModelPrice | null {
  let best: ModelPrice | null = null;
  for (const p of table.prices) {
    if (p.model === model) return p;
    if (model.startsWith(p.model) && (!best || p.model.length > best.model.length)) best = p;
  }
  return best;
}

const round = (n: number) => Math.round(n * 1e9) / 1e9;

export function usdOf(tokens: TokenTotals, p: ModelPrice): number {
  return round(
    (tokens.input * p.input +
      tokens.output * p.output +
      tokens.cacheRead * p.cacheRead +
      tokens.cacheWrite * p.cacheWrite) /
      1e6,
  );
}

/**
 * Estimated list-price cost. Unmatched model ids are listed in `unpriced` and excluded;
 * usage without a model id is excluded too (and has no id to list).
 */
export function costOf(
  rows: { model: string | null; tokens: TokenTotals }[],
  table: PriceTable,
): Cost {
  let usd: number | null = null;
  const unpriced = new Set<string>();
  for (const r of rows) {
    if (!r.model) continue;
    const p = priceFor(r.model, table);
    if (!p) unpriced.add(r.model);
    else usd = round((usd ?? 0) + usdOf(r.tokens, p));
  }
  return { usd, unpriced: [...unpriced] };
}

/** Throws Error with a readable message when the table is not acceptable for PUT. */
export function validatePrices(input: unknown): PriceTable {
  const fail = (m: string): never => {
    throw new Error(m);
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Prices must be an object");
  const t = input as Record<string, unknown>;
  if (typeof t.version !== "string" || t.version.length > 500) {
    fail("version must be a string of at most 500 characters");
  }
  if (t.currency !== "USD") fail("currency must be USD");
  if (!Array.isArray(t.prices) || t.prices.length < 1 || t.prices.length > 200) {
    fail("prices must have 1 to 200 rows");
  }
  const seen = new Set<string>();
  const prices = (t.prices as unknown[]).map((row, i): ModelPrice => {
    const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const model = typeof r.model === "string" ? r.model.trim() : "";
    if (!model) fail(`Row ${i + 1}: model must be a non-empty string`);
    if (seen.has(model)) fail(`Row ${i + 1}: duplicate model ${model}`);
    seen.add(model);
    const num = (key: "input" | "output" | "cacheRead" | "cacheWrite") => {
      const v = r[key];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1000) {
        fail(`Row ${i + 1} (${model}): ${key} must be a number from 0 to 1000`);
      }
      return v as number;
    };
    return {
      model,
      input: num("input"),
      output: num("output"),
      cacheRead: num("cacheRead"),
      cacheWrite: num("cacheWrite"),
    };
  });
  return { version: t.version as string, currency: "USD", prices };
}

/** The saved table, or the built-in default when none is saved or the saved one is unreadable. */
export function loadPrices(store: Store): PriceTable {
  const raw = store.getSetting("prices");
  if (raw) {
    try {
      return validatePrices(JSON.parse(raw));
    } catch {}
  }
  return defaultPrices();
}

export const savePrices = (store: Store, table: PriceTable) =>
  store.putSetting("prices", JSON.stringify(table));

export const resetPrices = (store: Store) => store.deleteSetting("prices");
