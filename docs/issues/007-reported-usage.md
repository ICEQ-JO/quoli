# 007: Display reported token and cache usage with honest gaps

Status: published as [GitHub #8](https://github.com/ICEQ-JO/quoli/issues/8); this file is the local reference. Milestone: M2.

## User value

A developer can understand reported consumption without invented precision.

## Scope

Implement request-level usage projection and dashboard using synthetic normalized usage; expose separate cache categories, reporting window/source, missing fields and a labeled derived cache-read token share. Define canonical-source selection.

## Non-goals

No pricing engine, billing, per-prompt/file cost allocation, productivity scores or live telemetry receiver.

## Dependencies

[006](006-fixture-timeline.md)

## Acceptance criteria

- [ ] Known request observations produce deterministic totals with evidence drill-down; unknown components stay null rather than zero.
- [ ] Request deltas, cumulative counters and status samples are separate views and cannot be added together.
- [ ] Cache-share formula and denominator are visible; zero/unknown denominator returns null and no cache-hit-rate claim.
- [ ] Partial windows, conflicts and late data update coverage labels without rewriting event history.

## Test plan

Golden tests cover reported zero, partial fields, cache-heavy usage, repeated requests, counter resets, mixed models and late arrival; browser check traces an aggregate to evidence.

## Privacy/security considerations

Use metadata-only usage by default; omit user identity and content-bearing telemetry attributes.

## Relative size

M
