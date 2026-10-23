# QUO-51 — usage normalization and cumulative reconciliation

QUO-51 advances P4 by normalizing reported request usage and reconciling
request deltas with cumulative counters without counting the same spend twice.

## Delivered

- Usage payloads accept an optional `provider`, `reasoning` token count and
  source-reported `costUsdMicros`. Absent values mean the source did not report
  them, so existing v1 bodies remain valid and source cost is never folded into
  token totals.
- `reported-request-sum/v2` keeps request identity scoped by project, session
  and request ID; corroborating retries count once and corrected counts stay a
  visible conflict instead of being summed.
- Cumulative counters are scoped by project, session, source, provider and
  model. Repeated samples count once; a decrease starts a new counter run, so
  the total is the sum of each run's last reading.
- When a session reports both deltas and counters, the deltas are the total and
  cumulative samples are counted as omitted overlap, so `complete` is false
  rather than silently double counted.
- The OTel receiver carries provider, reasoning and source cost when the record
  reports them. The workspace shows reasoning tokens and explains a cumulative
  or mixed basis.

## Limits

- Neither verified source reports a provider, so live events keep it null until
  an adapter reports one. Reasoning and source cost are likewise reported-only.
- A cumulative decrease is treated as a reset. A late correction that lowers a
  counter without a new run is indistinguishable and stays visible as a reset.
- Cumulative totals may include usage before capture because the first reading
  has no known baseline. The view names the basis instead of claiming otherwise.
- Cumulative scope includes model and provider. A source that reports one
  counter across models must report the counter per model, or the series
  identity needs a later contract change.
- Pricing, cost estimates and per-file attribution remain V16/V17 work.

## Validation

Synthetic tests cover mixed delta and cumulative streams, repeated samples,
resets, late samples ordered by source time, retries, corrected counts,
ambiguous overlap, zero versus null, provider/model scoping and safe-integer
overflow. No paid or private session was run.
