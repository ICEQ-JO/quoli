# Quoli: automatic repository history (local increment)

Originally developed on one local branch under the owner’s no-push instruction. The owner subsequently authorized publication and merge. Tracked in [#48](https://github.com/ICEQ-JO/quoli/issues/48). Relative size: M.

## User value and scope

Connect a Git repository once and review observed file versions, HEAD/branch transitions and newly reachable commit IDs without manual snapshot commands, regardless of which coding agent or editor makes changes. Use the existing safe reader, local history, diffs and capture controls. Make Claude hooks optional rather than mandatory for repository observation.

## Non-goals

Do not claim complete capture or agent authorship. No background OS service, cloud upload, package publishing, full Git log import, commit messages or author emails. Codex/Pi/OpenCode activity adapters and automatic attribution are subsequent increments, not implemented by a generic repository observer. Internal package names, existing storage locations and TRACEFRAME_* configuration stay compatible.

## Dependencies

Existing repository snapshots (#9/#28), diffs (#10/#29), lifecycle controls (#13/#38), local setup (#19/#44), and local reload fix (#46/#47).

## Acceptance criteria

- [x] Quoli is the visible product name; existing local storage and configuration continue to work.
- [x] A repository-only connect command opts into automatic observation without installing agent hooks.
- [x] The running collector discovers opted-in projects and captures initial and changed states automatically.
- [x] Unchanged captures are deduplicated across process restarts; branch/HEAD movement and bounded commit IDs are recorded honestly.
- [x] Pause, deletion, policy changes, root/storage isolation, capture quotas and observation failures are respected.
- [x] Repository history is readable in the dashboard and distinguishes observed changes from agent actions.
- [x] Disposable Git fixtures prove edits/commits/branch changes and privacy/lifecycle behavior without paid agents.

## Test plan and privacy/security

Use only disposable repositories and synthetic evidence. Exercise polling and collector lifecycle end to end; run schema/storage/observer/CLI tests, typecheck, lint, browser flows and a production build. Never execute recorded commands, hooks, filters or code in the observed repository. Sanitize before persistence; metadata-only remains the default. Polling is bounded sampling: intermediate writes/commits and changes while stopped may be missed. Publish no code, credentials or session data.

## Validation and remaining work

The full browser suite passed 25/25, including connection without hooks, automatic edit/commit capture, desktop/mobile repository history and diff inspection. A final targeted browser run passed after the storage-consent guard was added; desktop/mobile screenshots were visually inspected from ignored test output. The full unit/integration suite passed 117 checks, including observer/privacy/lifecycle/Git-cap tests. Typecheck, production build and smoke checks passed. Lint exits successfully with 42 pre-existing illustration warnings. Browser tests still log pre-existing aborted-request errors despite passing; no claim of a clean console is made.

The running local service uses the normal default private store, so `pnpm connect` can use its normal defaults. Subsequently connected this Quoli source repository at the owner’s request and verified live capture. No agent tool configuration was changed. Source publication is now authorized; no runtime package has been published.

Next bounded increment: verify supported Codex/Pi/OpenCode integration surfaces, define capability-labelled adapters with sanitized fixtures, then add activity integrations individually. Repository sampling does not substitute for those adapters or establish file authorship. Source-checkout setup is supported; a distributable install-once CLI and managed background lifecycle remain future work.

Subsequent local increment: [CLI and background runtime](cli-background.md) delivers the local distributable and managed lifecycle described above as future work. Agent adapters remain separate.
