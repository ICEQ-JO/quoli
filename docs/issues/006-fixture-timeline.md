# 006: Explore a synthetic session timeline with evidence details

Status: published as [GitHub #7](https://github.com/ICEQ-JO/quoli/issues/7); this file is the local reference. Milestone: M1.

## User value

A developer can see prompts, tool activity and capture gaps before connecting a real agent.

## Scope

Create sanitized synthetic fixtures, manifest and expected views; import through normal ingestion. Build project/session selection, cursor-paginated timeline and evidence inspector through the Next server proxy and a protected local browser session.

## Non-goals

No live Claude integration, generated explanations, diagram rendering or claim of exhaustive capture.

## Dependencies

[005](005-local-ingestion.md)

## Acceptance criteria

- [x] A documented demo command seeds fixtures and opens a useful dashboard with no Claude account or model call.
- [x] Fixture scenarios show prompt, successful/failed command, missing tool result, disabled content, out-of-order arrival and incomplete session.
- [x] Each relationship exposes basis and retained source evidence; missing versus disabled versus unsupported are visibly different.
- [x] Captured strings are escaped; loading/empty/error states, keyboard navigation and server-held collector credential work.

## Test plan

Browser test imports a fixture, restarts collector, paginates events, opens evidence and displays hostile HTML/prompt-injection text inertly; check no external requests.

## Privacy/security considerations

Synthetic provenance is explicit. Protect read/control routes, local browser authentication and CSRF without exposing ingestion credentials.

## Relative size

M

## Implementation checkpoint

Implemented three synthetic sessions, paginated timeline, filters, evidence navigation and protected browser reads. Desktop/mobile and hostile-text browser tests pass.
