import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LivePriceStatus, ModelPrice } from "../shared/model.ts";
import { home } from "./db.ts";

/**
 * Live model prices from models.dev, a public, maintained catalogue of model prices
 * (https://models.dev/api.json: providers → models → `cost` in USD per million tokens, with
 * optional `cache_read` and `cache_write`). Quoli fetches it at most once a day with a plain GET
 * that carries no identifiers and caches the prices in the Quoli home. Nothing about the user is
 * sent. Makers' prices come first, then OpenCode Zen's (the models OpenCode serves itself, some
 * free), then any other provider's for a model no one above lists, so a new model is priced as
 * soon as models.dev knows it.
 */
export const LIVE_SOURCE = "https://models.dev/api.json";
const DAY = 86_400_000;
const MAX_BYTES = 30 * 1024 * 1024;
/** Bumped when parsing changes, so an older cache is fetched again. */
const FORMAT = 2;

/**
 * Providers that sell their own models, in priority order: resellers list the same ids at their
 * own prices, so only the maker's price is used, and an id seen once is never replaced.
 */
const PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "xai",
  "mistral",
  "deepseek",
  "moonshotai",
  "alibaba",
  "zai",
  "minimax",
];

export interface LivePrices {
  source: string;
  fetchedAt: string;
  format?: number;
  prices: ModelPrice[];
}

const price = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000 ? v : null;

/**
 * Prices from a models.dev document. A model without a cache price is charged its input price
 * for cached tokens, which overstates rather than hides spend.
 */
export function parseModelsDev(data: unknown): ModelPrice[] {
  const out: ModelPrice[] = [];
  const seen = new Set<string>();
  if (!data || typeof data !== "object") return out;
  const first = [...PROVIDERS, "opencode"];
  const rest = Object.keys(data)
    .filter((p) => !first.includes(p))
    .sort();
  for (const provider of [...first, ...rest]) {
    const models = (data as Record<string, { models?: unknown }>)[provider]?.models;
    if (!models || typeof models !== "object") continue;
    for (const [id, m] of Object.entries(models as Record<string, { cost?: unknown }>)) {
      if (seen.has(id) || id.length > 200 || !/^[\w.:/@+-]+$/.test(id)) continue;
      const cost = (m?.cost ?? {}) as Record<string, unknown>;
      const input = price(cost.input);
      const output = price(cost.output);
      if (input === null || output === null) continue;
      seen.add(id);
      out.push({
        model: id,
        input,
        output,
        cacheRead: price(cost.cache_read) ?? input,
        cacheWrite: price(cost.cache_write) ?? input,
      });
    }
  }
  return out;
}

let current: LivePrices | null = null;
let lastError: string | null = null;

/** What the Prices settings show about live prices. */
export const liveStatusOf = (enabled: boolean): LivePriceStatus => ({
  enabled,
  source: LIVE_SOURCE,
  fetchedAt: current?.fetchedAt ?? null,
  models: current?.prices.length ?? 0,
  error: lastError,
});

export const liveFile = () => join(home(), "prices-live.json");

/** Reads the cache, then keeps prices fresh: checks now and every hour, fetching once a day. */
export function startLivePrices(enabled: () => boolean) {
  loadLiveCache(liveFile());
  const tick = () => {
    if (enabled()) void updateLivePrices();
  };
  tick();
  setInterval(tick, 3_600_000).unref();
}

/** One refresh that records its error instead of throwing. */
export async function updateLivePrices(options?: Parameters<typeof refreshLivePrices>[1]) {
  try {
    const live = await refreshLivePrices(liveFile(), options);
    lastError = null;
    return live;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return null;
  }
}

/** The live prices in memory, or null before the first successful fetch or cache read. */
export const livePrices = () => current;
export const setLivePrices = (live: LivePrices | null) => {
  current = live;
};

/** Reads the cached prices; an unreadable or invalid cache is ignored. */
export function loadLiveCache(file: string): LivePrices | null {
  try {
    const c = JSON.parse(readFileSync(file, "utf8")) as LivePrices;
    if (typeof c.fetchedAt !== "string" || Number.isNaN(Date.parse(c.fetchedAt))) return null;
    if (!Array.isArray(c.prices) || c.format !== FORMAT) return null;
    const prices = c.prices.filter(
      (p) =>
        typeof p?.model === "string" &&
        [p.input, p.output, p.cacheRead, p.cacheWrite].every((v) => price(v) !== null),
    );
    current = { source: LIVE_SOURCE, fetchedAt: c.fetchedAt, format: FORMAT, prices };
    return current;
  } catch {
    return null;
  }
}

/**
 * Fetches fresh prices when the cache is a day old or missing, and saves them. Returns what
 * changed, or null when nothing was fetched. Throws on a failed or implausible fetch; the caller
 * keeps the previous prices.
 */
export async function refreshLivePrices(
  file: string,
  { fetchImpl = fetch, now = Date.now(), maxAgeMs = DAY } = {},
): Promise<LivePrices | null> {
  if (current && now - Date.parse(current.fetchedAt) < maxAgeMs) return null;
  const res = await fetchImpl(LIVE_SOURCE, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`models.dev answered ${res.status}`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("models.dev price list is too large");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("models.dev price list is too large");
  const prices = parseModelsDev(JSON.parse(text));
  if (prices.length < 10) throw new Error("models.dev price list has too few priced models");
  const live = {
    source: LIVE_SOURCE,
    fetchedAt: new Date(now).toISOString(),
    format: FORMAT,
    prices,
  };
  writeFileSync(file, JSON.stringify(live));
  current = live;
  return live;
}
