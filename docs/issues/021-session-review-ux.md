# 021: Make session review readable, navigable and responsive

Status: implemented; tracked in [GitHub #23](https://github.com/ICEQ-JO/quoli/issues/23).

## User value

Developers can review an agent session quickly, read its evidence comfortably and find missing verification without navigating a sparse prototype.

## Scope

Improve the existing session explorer inside its established neutral/green identity. Replace the oversized introductory region with a task-focused session header; improve typography, density, session navigation, filtering and evidence inspection. Search all retained session observations with bounded server-side pagination. Preserve session/view/evidence in shareable local URLs. Make evidence accessible on small screens and improve loading, empty, error and keyboard states. Record design decisions and update the testing guide.

## Non-goals

No live Claude adapter, repository snapshots/diffs, change map, new product claims, branding exercise, cloud upload or integration settings.

## Dependencies

PR #22 (local synthetic session explorer); stacked until its dependencies are merged.

## Acceptance criteria

- [x] The first viewport prioritizes the selected session and its observations with readable body/control text and clear hierarchy.
- [x] Session search and filters find matching observations beyond the initially loaded page; pagination and source/receipt ordering remain consistent.
- [x] Session, view and selected evidence survive reload through a local URL; copying evidence links has visible feedback.
- [x] A visible review action leads to captured gaps; linked requests/results remain evidence-backed and feature correctness stays explicitly unknown.
- [x] Evidence inspection works in a focused mobile dialog with keyboard dismissal and on desktop alongside the activity list.
- [x] Loading, retry, empty results and pagination have clear feedback without stale results from another session.
- [x] Desktop/mobile, search, deep-link, keyboard and hostile-text checks pass; documentation reflects current behavior.

## Test plan

Add targeted query/pagination tests and browser tests for session-wide filtering, refreshable evidence links, mobile focus/dismissal, keyboard navigation and recovery. Keep existing privacy and inert-content checks. Inspect desktop/mobile together, correct observed defects once and confirm the final result. Run typecheck, lint, relevant tests and build.

## Privacy/security considerations

Continue server-side authentication, project/session-scoped queries and escaped output. URL state contains IDs and view state only; no prompts, search text, code or credentials. No remote fonts/assets/analytics or captured-content execution. Copying a link never uploads evidence.

## Relative size

M
