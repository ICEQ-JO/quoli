# 020: Evaluate an opt-in version-gated historical transcript importer

Status: unpublished draft. Milestone: Deferred; outside MVP.

## User value

If pilot evidence justifies it, a developer can inspect limited historical sessions without mistaking them for complete capture.

## Scope

Optional post-MVP experiment: document exact supported record shapes and source versions, explicit file selection, bounded JSONL/spill parsing, provenance offsets, redaction and reconciliation. Requires a founder decision to enter scope.

## Non-goals

No default whole-home scan, stable public-schema claim, checkpoint restoration, full historical recovery or prerequisite for MVP.

## Dependencies

[019](019-pilot-release.md)

## Acceptance criteria

- [ ] Importer is disabled by default; only selected allowed paths and tested versions are parsed, unknown shapes are marked unsupported.
- [ ] Partial lines, rotated/missing files, nested paths and oversized records stop or skip with visible coverage reasons.
- [ ] Imported observations retain sanitized locators and do not double-count live evidence; ambiguous overlap stays separate.
- [ ] No raw transcript copies, followed outside-root pointers or executable interpretation; consent/retention/deletion apply.

## Test plan

Synthetic versioned JSONL fixtures cover malformed tails, missing spills, traversal/symlink attempts, duplicate content without shared IDs and live/import overlap.

## Privacy/security considerations

Transcripts can contain prompts, code and secrets even when live capture was disabled; explicit content consent and pre-persistence redaction are mandatory.

## Relative size

M
