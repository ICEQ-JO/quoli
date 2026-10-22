# 015: Receive reported Claude usage through a narrow local OTLP endpoint

Status: published as [GitHub #16](https://github.com/ICEQ-JO/quoli/issues/16); this file is the local reference. Milestone: M4. Implemented on `feat/otel-receiver`; see the [reported usage receiver](../telemetry-receiver.md).

## User value

A developer sees source-reported usage alongside their live timeline.

## Scope

Implement the single OTLP logs encoding verified in 013, authenticated on the collector, with bounded decoding and an allowlist of request-usage/correlation fields. Convert into normalized observations and connect usage UI. Record unsupported signals without payload dumps.

## Non-goals

No standalone OTel service, metric/traces backend, remote exporter, raw API-body logging or broad telemetry platform.

## Dependencies

[014](014-claude-hooks.md)

## Acceptance criteria

- [x] Authorized local request records display nullable input/output/cache fields and source evidence in the existing dashboard.
- [x] Malformed, oversized, unauthorized and unsupported payloads return bounded errors before any raw persistence.
- [x] Request IDs and verified producer identity support safe retries; records without identity have explicit ambiguity.
- [x] With hooks only or no telemetry, usage remains unavailable with a reason; collection never fabricates counts.

## Test plan

Protocol fixtures test actual verified encoding, nested limits, missing fields and repeat delivery; compare reported synthetic usage with dashboard totals and verify no outbound requests.

## Privacy/security considerations

Discard non-allowlisted identity/content attributes in memory; keep raw-body logging disabled and do not overwrite another telemetry destination.

## Relative size

M
