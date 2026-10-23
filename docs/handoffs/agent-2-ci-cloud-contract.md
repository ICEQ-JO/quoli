# Agent 2 — Overnight CI baseline and cloud contract

You are the primary implementation agent for the two independent bounded issues below. Work autonomously within this scope and leave separate reviewable PRs and a clear morning report. Do not merge or deploy.

## Start and isolation

Read root `AGENTS.md`, `docs/README.md`, `docs/vision.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/implementation-progress.md` and the issue scopes below. Load Ponytail before coding and Ponytail Review before final review. Follow nested instructions for any touched area.

The vision/backlog is in open [PR #58](https://github.com/ICEQ-JO/quoli/pull/58), branch `docs/vision-backlog-scaffold`. Base both increments on its current remote tip, not stale main. Do not merge #58. If already merged, use updated main and verify the packet and issue files exist.

Use an isolated checkout. If your environment has not already provided one, run from the repository:

```sh
git fetch origin
git worktree add -b feat/quo-41-ci-baseline ~/Dev/quoli-night-ci origin/docs/vision-backlog-scaffold
cd ~/Dev/quoli-night-ci
```

Do not remove/reset an existing worktree or branch if a name is taken; inspect it and use a distinct name. Never edit the owner's or Agent 1's checkout. Use existing pinned toolchain/dependencies rather than upgrading them opportunistically.

## First issue — QUO-41 / V05

[Linear issue](https://linear.app/quolii/issue/QUO-41) · [complete local scope](../issues/vision/v05.md).

Select QUO-41 in **Quolii** and mark it In Progress. Never access Documentu-ai. Advance CI/release discipline and legal/trust gates.

Add the smallest meaningful automated PR baseline using existing scripts and synthetic fixtures. Inspect root/package manifests, lockfile, toolchain requirements, browser setup, release builder/test and existing test configuration before choosing workflow steps. Verify current official CI/runtime contracts when uncertain; do not copy an outdated setup recipe.

Cover lint, type checks, unit/integration checks, appropriate browser checks and release-artifact/privacy inspection. Keep jobs/permissions minimal, avoid redundant full builds and use dependency caching only where sound. Pin actions/toolchain appropriately and document the trust choice. Untrusted PRs must not receive secrets; do not use a privileged workflow to execute their code. Never cache/upload runtime evidence stores, credentials, private logs or unchecked whole directories.

Run workflow-equivalent commands in your isolated checkout and inspect artifacts. If GitHub is available, push/open the PR and inspect actual check results. A workflow file is not proof that CI passed. Demonstrate failure detection through a disposable/local check or documented workflow evidence; do not leave intentionally failing commits as the final branch. Do not claim branch protection is enabled unless verified, and do not change repository protection settings overnight.

Agent 1 is repairing a known bridge privacy bug. Baseline failures must be reproduced and recorded. Do not fix Agent 1's code, weaken its tests or redefine expected privacy behavior to obtain green CI. Keep the existing suite; coordinate through issue/PR notes if an actual dependency appears.

## Second issue — QUO-19 / C01

[Linear issue](https://linear.app/quolii/issue/QUO-19) · [complete local scope](../issues/vision/c01.md). This issue is independent of the CI implementation; start it after the first PR is reviewable or while an actual external CI blocker prevents further useful work.

Create a separate branch/checkout, `docs/quo-19-cloud-contract`, from the same approved vision base, not from unfinished CI changes. Mark QUO-19 In Progress and deliver a concrete data-flow/sync contract and threat-model packet.

**Settled product direction:** hosted dashboard + local connectors; OpenCode/Pi/Claude Code/Codex destination; observable activity, cost, extension use and native evidence scenes; concrete architecture/debt implementation after evidence validation. Do not reopen cloud versus local-only product direction.

Define:

- User/workspace/project/device/repository identities and server-derived tenant scope; basic role boundaries and revocation.
- Separate local capture and cloud upload consent, content classes, policy/device/project generations, explicit backfill selection and fail-closed behavior.
- Versioned batch/receipt examples, stable delivery identity, commit-before-ack, retry/deduplication, bounded queues, offline/reconnect and missing/unsupported states.
- Cloud primary observations/artifact ownership versus rebuildable projections; tenant scope in rows, object keys, caches, jobs, queries, cursors and exports.
- Pause/consent reduction/device revocation/project/account deletion, disconnected producers, backups and tombstone replay; exported-copy limits.
- Threat scenarios and testable mitigations for spoofed scope, replay, stale consent, signed-URL leakage, untrusted captured text, cross-tenant jobs and restored deleted evidence.
- Minimal hosting/auth/storage/queue approaches, operational responsibility and region/retention questions. Verify vendor-specific claims against official sources and cite retrieval dates. Prefer fewer components; do not invent an infrastructure stack nobody needs.

Create `docs/cloud/sync-contract.md` and `docs/cloud/threat-model.md`; update `docs/architecture.md` narrowly to link them and reconcile accepted technical boundaries. Use small synthetic JSON examples and check examples for schema/consistency where practical. These are proposed contracts, not delivered endpoints or cloud-security certification.

Separate recommendations from owner decisions. Owner-dependent buyer, pricing, region/legal obligations or vendor commitments remain explicitly unresolved with a recommendation and impact. Do not pretend approval exists, provision paid resources, create production accounts, store real credentials or upload evidence. Draft the contract despite unresolved choices; do not spend the whole night waiting for an answer.

## Ownership and coordination

You own `.github` workflows, directly needed CI configuration, artifact/check wiring, CI validation documentation, new `docs/cloud` contract/threat-model docs and narrow `docs/architecture.md` integration. Change shared package scripts/lockfile only if genuinely necessary, with a clear reason; do not upgrade dependencies as cleanup.

Agent 1 owns bridge/spool/privacy/lifecycle/storage fixes and their focused tests, `docs/lifecycle-controls.md` and `docs/hook-bridge.md`. Do not edit those implementation paths, v2 event schemas, adapter logic, global vision, backlog/index or implementation checkpoint. Put proposed shared-reference/status updates in your morning report. No cloud application scaffold, UI redesign or unrelated cleanup.

## Validation and delivery

Review each final change with Ponytail Review and fix meaningful findings. Record actual command/CI/link/example checks and limitations. The contract issue is ready for owner review, not approved by your own assertion; retain unresolved acceptance as such. CI baseline completion requires observed results, not only a committed workflow.

Use ICEQ-JO author and committer with `151853839+ICEQ-JO@users.noreply.github.com`. Verify the authenticated GitHub user is ICEQ-JO before push/PR writes. If unavailable, keep local commits and report the blocked external action. Primary agents may publish their own PRs; supporting agents may not publish independently. No merges, main pushes, cloud deployments or repository-setting changes.

If #58 is open, both PRs target `docs/vision-backlog-scaffold`; explain the base dependency. Otherwise target updated main. PRs name their gate, Linear issue, final behavior, validation and limits. Keep issue status and acceptance criteria current, without claiming unverified results or using `Closes #N` for Linear identifiers.

If using supporting OpenCode agents, verify the installed free MiniMax identifier, isolate bounded ownership and never include private code/sessions/credentials in prompts; personally review and rerun their work. Do not change owner tooling.

Stop after the bounded deliverables are reviewable or a real blocker prevents progress. Leave an issue-specific result file on each branch (`docs/work/overnight-ci-results.md` and `docs/work/overnight-cloud-contract-results.md`) with issue/branch/PR links, commit IDs, exact checks/outcomes, decisions versus recommendations, blockers and next safe action. Do not start C02, schema v2 or another backlog issue just to keep running.
