# QUO-52 — versioned model prices and inspectable cost estimates

QUO-52 advances P4 by pricing resolved request usage against an effective-dated
catalog and keeping the formula, catalog version and unpriced inputs visible.

## Delivered

- `packages/schema/src/cost.ts` defines `list-price-usage/v1`: a strict catalog
  with a version, one currency, model entries (canonical name, aliases,
  optional provider, inclusive/exclusive effective dates) and integer rates in
  micros per million tokens for input, output, cache read, cache write and
  reasoning.
- `packages/analysis/src/cost.ts` prices resolved request deltas with integer
  (`BigInt`) arithmetic, half-up per category. Each request exposes its
  catalog model, per-category tokens, rate, subtotal and reason, plus the
  separate source-reported `costUsdMicros`.
- Dates come from the request's `sourceTime` in UTC. The later entry wins at a
  boundary because `effectiveFrom` is inclusive and `effectiveTo` is exclusive.
- Unknown or ambiguous models, missing dates, missing tokens, missing rates and
  overflow stay visible as `partial`/`unpriced` instead of being guessed.
  Conflicting observations are not priced; cumulative-only usage is omitted
  because it has no per-request date.
- Every estimate carries the catalog version and the exact rates it used, so a
  later catalog revision does not change an earlier estimate's explanation.
- `usage()` and `estimateCost()` now share one usage grouping (`groupUsage`) so
  request identity, corroboration and conflicts cannot drift between the total
  and the price.

## Limits

- The shipped catalog (`fixtures/prices.ts`) is synthetic. Verified provider
  prices, effective dates and a production catalog review remain required
  before any real cost is shown.
- Single currency only; no live exchange-rate conversion, billing ledger or
  invoice reconciliation.
- Cumulative counters are not priced. A source that reports only cumulative
  usage needs a later contract for per-request dates or counter segments.
- The cost view is V17 work; this increment does not add a screen.

## Validation

- 16 synthetic tests cover exact category subtotals, date boundaries, alias
  resolution and ambiguity, missing rates/tokens, zero-token categories,
  unknown models, dates and currencies, cumulative-only usage, mixed partial
  totals, corroboration, conflicts, half-up rounding, overflow,
  provider-specific entries, catalog validation and estimate history.
- `pnpm test`: 184 tests, 180 passed, 4 release-only skips, 0 failed.
- `pnpm typecheck` and `pnpm lint` pass; lint keeps the 3 pre-existing warnings.
- No paid API, private session or live provider price was used.
