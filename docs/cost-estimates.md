# List-price cost estimates

`list-price-usage/v1` turns resolved request usage into an inspectable estimate
against an effective-dated price catalog. It is a list-price calculation, not a
provider invoice, a subscription cost or a billing ledger.

## Catalog

A catalog is a versioned, single-currency document:

- `version` identifies the catalog revision carried into every estimate.
- `currency` is an ISO 4217 code such as `USD`, or null for an explicit
  unknown currency. There is no conversion; a null currency leaves the whole
  estimate unpriced.
- Each model entry has a canonical model, aliases, an optional provider,
  `effectiveFrom` (inclusive), `effectiveTo` (exclusive, or null) and rates.
- Rates are integer **micro-currency units per million tokens** for `input`,
  `output`, `cacheRead`, `cacheWrite` and `reasoning`. A null rate means the
  catalog does not price that category.
- A provider-specific entry only matches a request that reports the same
  provider. A null provider entry matches any provider.

The contract lives in `packages/schema/src/cost.ts`. The fixture
`fixtures/prices.ts` is synthetic: its model names and amounts are invented and
no real provider price is shipped.

## Calculation

Only identified request deltas are priced. Cumulative counters have no
per-request date, so pricing them at one rate would invent a date boundary;
they stay counted as omitted usage. Conflicting observations for one request
stay unpriced.

The request date is the UTC date of `sourceTime`. The formula is:

```
subtotal(category) = round(tokens * microsPerMillionTokens / 1_000_000)
total = sum of category subtotals across priced requests
```

Rounding is half-up per category using integer arithmetic (`BigInt`), so the
same input always produces the same micros. A zero-token category costs zero
and does not need a rate. A product that leaves safe-integer range is marked
`overflow` instead of losing precision.

## States and reasons

| State | Meaning |
| --- | --- |
| `complete` | Every request and category is priced. |
| `partial` | Some inputs are priced; the total sums only priced inputs. |
| `unpriced` | No input could be priced, or there were no request deltas. |

Request reasons: `conflicting_usage`, `missing_date`, `unknown_model`,
`ambiguous_model`, `unknown_currency`, `missing_tokens`, `missing_rate`,
`overflow`. A partial total is labelled partial rather than presented as a full
cost.

## Separation and history

- The estimate is a list price in the catalog currency.
- A source-reported `costUsdMicros` stays on the request as
  `reportedCostUsdMicros`; it is never folded into the list price.
- Subscription cost is not modelled.
- An estimate records its catalog version, rates and formula. Updating the
  catalog does not rewrite an estimate already calculated; it stays
  explainable with the version and rates it used.

## Limits

- The production catalog still needs verified provider prices and a review of
  each effective date. This increment ships the contract, calculation and a
  synthetic fixture.
- Unknown or ambiguous models, missing dates and missing categories remain
  visible as unpriced or partial; they are not guessed.
- No live exchange-rate conversion, billing ledger, invoice reconciliation or
  per-file attribution is claimed.
- The cost view is V17 work; this increment exposes the estimate to later
  scenes and UI, not a new screen.
