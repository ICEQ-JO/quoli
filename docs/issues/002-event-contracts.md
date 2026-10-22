# 002: Define nullable events and inspectable evidence contracts

Status: published as [GitHub #3](https://github.com/ICEQ-JO/quoli/issues/3); this file is the local reference. Milestone: M1.

## User value

Every later screen can distinguish captured facts, deterministic computations and unknowns.

## Scope

Define runtime schemas and API contracts for event envelopes, sessions, usage, snapshots, artifacts, content state, policies and evidence relationships. Specify source IDs, producer identity, ordering, rule versions and append-only correction semantics.

## Non-goals

No adapter parser, storage engine, hidden-reasoning fields or guessed usage values.

## Dependencies

[001](001-scaffold.md)

## Acceptance criteria

- [x] All relationship contracts require recorded/derived/inferred basis and evidence references; deterministic relationships include rule identity/version.
- [x] Usage fields are independently nullable and typed with units/scope/temporality; missing differs from recorded zero.
- [x] Versioned synthetic examples cover absent IDs, omitted content, truncation, incomplete tools and unknown event versions.

## Test plan

Contract tests accept representative valid variants and reject missing provenance, invalid numerics, oversized structures and unsupported schema versions.

## Privacy/security considerations

Treat all string fields and source locators as untrusted; contracts must not require retention of raw private payloads.

## Relative size

M

## Implementation checkpoint

Implemented strict event/evidence contracts and source locators. Future explicit source-correction payloads remain a later design; current history accepts supplemental observations without mutation.
