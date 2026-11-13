import type { Cost, ModelPrice, PriceTable, TokenTotals } from "../shared/model.ts";
import type { Store } from "./db.ts";
import { livePrices } from "./liveprices.ts";

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
  // OpenAI standard tier, up to 272K input. OpenAI does not bill cache writes separately.
  ["gpt-6-astra", 10, 50, 1, 10],
  ["gpt-6.1-sol", 2, 10, 0.1, 2],
  ["gpt-6.1-terra", 1, 5, 0.05, 1],
  ["gpt-6-sol", 2, 10, 0.2, 2],
  ["gpt-6-luna", 0.1, 0.5, 0.01, 0.1],
  ["gpt-5.6-sol", 4, 20, 0.4, 4],
  ["gpt-5.6-terra", 2, 12, 0.2, 2],
  ["gpt-5.6-luna", 0.2, 1.2, 0.02, 0.2],
  ["gpt-5.5", 5, 30, 0.5, 5],
  ["gpt-5.4", 2.5, 15, 0.25, 2.5],
  ["gpt-5.4-mini", 0.75, 4.5, 0.075, 0.75],
  ["gpt-5.4-nano", 0.2, 1.25, 0.02, 0.2],
  ["gpt-5.3-codex", 1.75, 14, 0.175, 1.75],
  ["gpt-5.2", 1.75, 14, 0.175, 1.75],
  ["gpt-5.1", 1.25, 10, 0.125, 1.25],
  ["gpt-5", 1.25, 10, 0.125, 1.25],
  ["gpt-5-mini", 0.25, 2, 0.025, 0.25],
  ["gpt-5-nano", 0.05, 0.4, 0.005, 0.05],
];

export const defaultPrices = (): PriceTable => ({
  version:
    "Anthropic list prices as of 2026-11-03 (cache writes and older cache reads derived: read 0.1× input, write 1.25× input); OpenAI standard-tier prices up to 272K input as of 2026-11-12 (cache writes at the input price)",
  currency: "USD",
  prices: ROWS.map(([model, input, output, cacheRead, cacheWrite]) => ({
    model,
    input,
    output,
    cacheRead,
    cacheWrite,
  })),
});

/**
 * Exact model id first, then the longest price `model` followed by a dash and a digit, as in a
 * dated snapshot (`claude-opus-5-5-20261001`, `gpt-5-2025-08-07`). `gpt-5` never prices
 * `gpt-5.3-codex` or `gpt-5-codex`: a different model stays unpriced rather than guessed.
 * An id with a provider in front (`opencode/minimax-m2.5-free`) is also tried without it.
 */
export function priceFor(model: string, table: PriceTable): ModelPrice | null {
  const found = priceOf(model, table);
  const bare = model.slice(model.lastIndexOf("/") + 1);
  return found ?? (bare && bare !== model ? priceOf(bare, table) : null);
}

function priceOf(model: string, table: PriceTable): ModelPrice | null {
  let best: ModelPrice | null = null;
  for (const p of table.prices) {
    if (p.model === model) return p;
    const snapshot = model.startsWith(p.model) && /^-\d/.test(model.slice(p.model.length));
    if (snapshot && (!best || p.model.length > best.model.length)) best = p;
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

/**
 * Adds live prices to a table. With the built-in table, a live price replaces the built-in row for
 * the same model id (it is newer); with a table the user edited, the user's rows always win and
 * live prices only fill in models it does not price.
 */
export function withLive(
  table: PriceTable,
  live: ModelPrice[] | null,
  edited: boolean,
): PriceTable {
  if (!live?.length) return table;
  const prices = edited
    ? [...table.prices, ...live.filter((p) => !priceFor(p.model, table))]
    : [...live, ...table.prices.filter((p) => !live.some((l) => l.model === p.model))];
  return { ...table, prices };
}

let memo: { key: string; table: PriceTable } | null = null;

/** The prices costs are computed with: the price table plus live prices when they are on. */
export function effectivePrices(store: Store): PriceTable {
  const raw = store.getSetting("prices");
  const live = store.settings().livePrices ? livePrices() : null;
  const key = `${raw ?? ""}\0${live?.fetchedAt ?? ""}`;
  if (memo?.key === key) return memo.table;
  const table = loadPrices(store);
  // Any saved table is the user's: their rows win over live prices.
  const merged = withLive(table, live?.prices ?? null, raw !== null);
  memo = {
    key,
    table: live?.prices.length
      ? {
          ...merged,
          version: `${table.version}; with models.dev prices fetched ${live.fetchedAt.slice(0, 10)}`,
        }
      : merged,
  };
  return memo.table;
}

export const savePrices = (store: Store, table: PriceTable) =>
  store.putSetting("prices", JSON.stringify(table));

export const resetPrices = (store: Store) => store.deleteSetting("prices");
