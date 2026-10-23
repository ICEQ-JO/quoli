# Agent 1 — Overnight retry privacy and lifecycle repairs

You are the primary implementation agent for the bounded work below. Work autonomously within this scope and leave reviewable PRs and a clear morning report. Do not merge. Read the actual source before editing; this packet is not proof of a diagnosis or a finished design.

## Start and isolation

Read root `AGENTS.md`, `docs/README.md`, `docs/vision.md`, `docs/architecture.md`, `docs/implementation-progress.md` and the issue scopes linked below. Load Ponytail before coding and Ponytail Review before final review. Follow nested instructions for any touched area.

The vision/backlog is in open [PR #58](https://github.com/ICEQ-JO/quoli/pull/58), branch `docs/vision-backlog-scaffold`. Base your work on its current remote tip, not stale main. Do not merge #58. If it has already merged, use updated main and verify that the packet and issue files exist.

Use an isolated checkout. If your environment has not already provided one, run from the repository:

```sh
git fetch origin
git worktree add -b feat/quo-39-retry-capture-policy ~/Dev/quoli-night-privacy origin/docs/vision-backlog-scaffold
cd ~/Dev/quoli-night-privacy
```

Do not remove/reset an existing worktree or branch if a name is taken; inspect it and use a distinct name. Never edit in the owner's shared checkout. Install the pinned dependencies in your own checkout using the existing package-manager workflow.

## First issue — QUO-39 / V02

[Linear issue](https://linear.app/quolii/issue/QUO-39) · [complete local scope](../issues/vision/v02.md).

Select QUO-39 in **Quolii** and mark it In Progress. Never access Documentu-ai. Advance the data-controls and legal/trust gates.

Fix policy enforcement **before every durable retry write**. Current path: `apps/bridge/src/index.ts` → `normalizeHook()` → failed delivery → `spool()`. Pattern redaction alone does not respect project prompt/tool/code consent. Unknown policy must fail closed for content without blocking the coding agent indefinitely. Keep collector-side revalidation and quiet hook behavior.

Start by tracing:

- `apps/bridge/src/index.ts`, `normalize.ts`, `spool.ts` and their callers.
- `packages/schema/src/privacy.ts`, existing event/content contracts.
- `packages/storage/src/index.ts` and `runtime.ts` for trusted policy/lifecycle state.
- Existing bridge, controls, collector and lifecycle tests; setup/package runtime paths if affected.

Choose the smallest design that works across actual standalone hook processes and collector downtime. Do not add an untrusted fallback policy or log captured payloads. Do not open a new SQLite writer in the hook casually; understand the existing single-writer and lifecycle boundaries first. Bound stdin before unbounded parsing. Preserve raw source semantics and explicit gaps.

Add regression tests through the real hook subprocess with an unavailable collector. Use only temporary synthetic projects/data. Inspect the retry files for canaries under disabled/default policy, explicit allowed content, nested code, excluded paths, pause/unknown policy and oversized/malformed payloads. Verify hook stdout/exit behavior and existing delivery behavior. Record what is actually demonstrated.

## Second issue — QUO-40 / V03, only after the first is reviewable

[Linear issue](https://linear.app/quolii/issue/QUO-40) · [complete local scope](../issues/vision/v03.md). Its blocker is QUO-39.

Once QUO-39 is implemented, reviewed and meaningfully tested, open its PR. You may prepare QUO-40 as a **stacked draft** on that branch while it awaits owner review. Record the unmerged prerequisite explicitly; do not claim the Linear dependency is complete or remove it. If the first fix is unresolved, stay on it rather than starting the second.

Coordinate project-scoped spool cleanup and generation fencing with purge, retention, policy reduction and re-registration. Old retries must not resurrect deleted evidence; unrelated projects must remain intact. Cover concurrent append/drain/purge and restart/interruption. Test the real boundaries, not just a pure helper. Keep accepted evidence append-only except explicit lifecycle deletion.

For the second increment use a separate branch, `feat/quo-40-retry-lifecycle`, based on your validated QUO-39 branch; use a separate checkout where practical. Open a draft PR against the QUO-39 branch until its parent is merged. Never merge the parent yourself.

## Ownership and coordination

You own bridge retry/capture/lifecycle implementation and directly affected storage/schema/collector callers, focused regression tests, `docs/lifecycle-controls.md`, `docs/hook-bridge.md` and a new issue-specific validation record.

Agent 2 owns CI, cloud contract/threat-model documents and `docs/architecture.md`. Do not edit `.github`, shared package scripts/lockfile/toolchain, target architecture, global vision or global backlog/index files. If a cross-area edit is necessary, describe the required change in your PR/morning report rather than silently editing Agent 2's area. Keep implementation-checkpoint updates as proposed text in your report to avoid shared-file conflicts.

Do not begin v2 schema redesign, new adapters, cloud sync, UI redesign or unrelated cleanup. Preserve v1 evidence and the demo. No real sessions, paid API calls, owner harness settings, service installs or uploads.

## Validation and delivery

Run focused privacy/lifecycle tests, type checks and lint, plus broader regression/release checks only where affected. Review the full connected paths with Ponytail Review; fix meaningful findings. Do not weaken tests or delete failing assertions to obtain green output. Record pre-existing failures separately with reproductions.

Use ICEQ-JO author and committer with `151853839+ICEQ-JO@users.noreply.github.com`. Verify the authenticated GitHub user is ICEQ-JO before any push/PR write. If unavailable, retain local commits and report the blocked external action. Primary agents may publish their own PRs under these agreements; supporting agents may not publish independently. No merges or main pushes.

If #58 is still open, the first PR targets `docs/vision-backlog-scaffold`; explain this dependency. Otherwise target updated main. A PR names its pillar/gate, Linear issue, final behavior, validation and limits. Keep Linear acceptance/status honest: an unmerged dependent draft is not a completed prerequisite. Use no `Closes #N` for Linear identifiers.

If using supporting OpenCode agents, verify the installed free MiniMax model identifier, give isolated bounded ownership, omit private code/sessions/credentials from prompts, and personally review/rerun their work. Do not change owner tool configuration.

Stop when these bounded deliverables are reviewable or a real external blocker prevents progress. Leave `docs/work/overnight-privacy-results.md` on your branch with issue/branch/PR links, commit IDs, exact checks/outcomes, remaining risks, blockers and the next safe action. No invented test success or automatic scope expansion to fill the night.
