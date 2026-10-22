# Repository assessment and implementation plan

## Initial assessment

Inspected `~/Dev/quoli` on 2026-10-22, including hidden directory entries, repository files, parent instructions, Git status/history/remotes, and GitHub CLI authentication.

- The directory is empty: no application code, manifests, lockfiles, tests, documentation, or `.git` directory.
- No applicable `AGENTS.md` was found in the workspace or inspected ancestors.
- There are no existing conventions or useful implementation assets to preserve. The directory name `quoli` is not evidence of an existing product architecture.
- `gh` is installed and authenticated, but there is no Git remote or identified GitHub repository. At the time of the initial assessment, issue drafts were local and no repository had been initialized.
- No dependency installation, Claude Code configuration changes, service installation, or live session collection was performed. Official documentation was inspected read-only. Runtime support remains unverified.

## Authorized repository setup

Following the owner's subsequent instruction, the workspace is connected to [ICEQ-JO/quoli](https://github.com/ICEQ-JO/quoli), with an initial README commit on `main`. The reference documents and contributor agreements are delivered on a feature branch through a pull request. Git author and committer are `ICEQ-JO`, using the account's GitHub no-reply email. The 19 medium-sized MVP issues are published and linked in the backlog; the optional experiment remains deferred. GitHub is the work tracker; Linear is not used.

Documentation can be challenged and revised with rationale. The owner's explicit direction takes precedence over stale recommendations. No product implementation, service installation or live agent configuration is included in this setup.

## Current implementation status

A synthetic local preview now runs with `pnpm demo`. The [local demo guide](local-demo.md) distinguishes implemented behavior from the remaining MVP. Foundations include strict event/evidence contracts, in-memory policy filtering, SQLite append/query support, authenticated loopback ingestion and the fixture dashboard. The preview also includes deterministic reported-usage views from milestone M2.

Integration discovery remains documentation-only; no personal session collection or Claude configuration has been enabled. Dedicated source-file cursors, separate blob storage, full capture/retention controls, repository snapshots/diffs and live-source reconciliation remain later work. Product tests now exist; the planning-pass statement below describes the earlier pass only.

## Proposed implementation approach

Use the requested pnpm/TypeScript workspace, a Next.js dashboard, one local Node collector, SQLite, and local artifact files. Package directories describe boundaries, not separate deployed services. Exact framework/runtime versions must be chosen and pinned during scaffolding after compatibility checks; no speculative version numbers are embedded here.

The first usable increment is a synthetic session timeline through the same validation, privacy, ingestion, storage, and read interfaces as live data. Next add reported usage, repository diffs, explicit evidence links, and a bounded change map. Only after that demonstration passes should we verify a supported installed Claude Code version and implement live hooks and local telemetry reception.

The event history is authoritative. Query models, aggregates, summaries, and graph projections are disposable, versioned derivations. “Recorded” means a source reported or a snapshot observed something; it does not certify the truth of arbitrary captured text.

## Dependency-ordered milestones

Issue details and exact prerequisite IDs are in the [backlog](issues/README.md). Within a milestone, follow those dependencies; milestone numbering is a recommended delivery sequence, not an additional dependency on every preceding issue.

| Milestone | Draft issues | Demonstration / exit gate |
| --- | --- | --- |
| M1 — Synthetic timeline | 001–006 | One command starts local services; fixture import survives restart; prompts, tools, missing results and gaps are inspectable with evidence labels. No paid API required. |
| M2 — Understand a change | 007–011 | Inspect usage, before/after diffs, a command result and a bounded map from synthetic sessions and disposable Git repositories. Every edge opens its evidence and deterministic rule. |
| M3 — Safe local lifecycle | 012 | Change capture controls, preview redaction, expire data and delete a project including pending ingestion and artifacts. Required before live collection. |
| M4 — Verified live evidence | 013–017 | Record one explicitly enabled Claude Code session on a disposable repository; reconnect/retry without duplicate totals; concurrent user changes remain ambiguously attributed. |
| M5 — Local pilot | 018–019 | Fresh-machine setup, disable/uninstall, offline fixture demo, malicious-input checks and local-only operation pass on the declared supported platforms. |
| Deferred experiment | 020 | Optional transcript importer only if documented live interfaces leave a validated user need. Not required for MVP release. |

Recommended build order: 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 → 012 → 013 → 014 → 015 → 016 → 017 → 018 → 019. Issue 020 is excluded from this chain.

The critical integration gate is 013: current documentation is researched in this planning pass, but payload examples are not a substitute for a supported-version runtime check. If a capability fails that check, publish its limitation locally, leave its values null and use the fixture dashboard; never silently fall back to parsing private formats.

## Definition of MVP done

A developer can explicitly connect one local Git repository, enable supported Claude Code collection, inspect available session events and reported usage, compare captured file versions, explore evidence-backed change relationships, and distinguish observed checks from missing verification. They can pause capture, change content policies, apply retention and delete project data. The complete fixture demonstration runs with no Claude account or paid API. Live Claude Code use requires the user's own access, but Traceframe introduces no model calls.

All displayed relationships have a basis and evidence IDs. All missing, omitted, unsupported, truncated and ambiguous values have reasons. UI text does not imply hidden reasoning, complete capture, proof of feature correctness, wasted work, or exact file/prompt costs.

## Explicit scope boundary

No billing, organizations, permissions for teams, cloud sync, other agent integrations, autonomous edits, command replay, universal behavior analysis, file/prompt cost attribution, productivity scoring, custom diagram language, or generated model explanations. The first visual explanation is a deterministic, navigable account of changed files, observed tool activity and checks; it is not a runtime dependency oracle.

## Delivery and estimation

Each core issue is medium-sized (M), independently reviewable and demonstrable after its prerequisites. M means a bounded capability spanning persistence and UI or a carefully bounded integration. These are relative sizes, not day estimates. Avoid calendar commitments until M1 establishes team velocity and issue 013 establishes integration support.

Release gates include relevant schema/migration tests, retry and overlap fixtures, repository edge cases, deletion races, malicious captured text, and browser end-to-end checks. No product tests were run in this planning pass because no product exists. The documentation itself is checked for local links, required issue sections, valid dependencies and cycles.
