# Repository assessment against the vision

Assessment date: 2026-10-23. Scope: the local source tree and planning documents. Target updated to the hosted dashboard/local-connector direction; original local-code findings remain applicable. Expected current load: one developer with a local collector, SQLite store and browser workspace. Future paid-pilot and multi-harness needs are gaps, not evidence of current production failures.

What this repo does: Quoli stores local, sanitized observations and repository snapshots, then derives session review, diffs, checks, usage and a bounded change map. It has a Claude hook bridge, a narrow usage receiver and a managed local CLI. Most of this foundation remains useful for the updated vision.

## Must fix

### 1. Retry persistence bypasses capture controls

**What this is:** `apps/bridge/src/index.ts` normalizes a hook, attempts delivery, then calls `spool(parsed.data)` on failure. `normalize.ts` applies pattern redaction but does not apply the project's prompt/tool/code settings. `spool.ts` writes that event to disk.

**Problem:** a prompt with ordinary private text can be written to the retry file even when prompt capture is disabled. Secret-pattern redaction is not capture consent. The collector's later sanitization cannot undo the earlier disk write.

**Evidence:** a temporary synthetic check registered a default-policy project (`prompt: false`), normalized a prompt containing `SYNTHETIC_PRIVATE_PROMPT_CANARY`, spooled it, and asserted that the canary remained in the spool. The temporary directory was removed. The failed-delivery call path was source-traced; the check invoked normalization/spooling directly, not a live harness.

**Smallest repair:** apply trusted current capture/lifecycle policy before every durable retry write; if policy cannot be established, fail closed for content. Recheck at delivery. Add a focused offline bridge test through the real hook entry point. See V02.

**If skipped:** disabling capture fails to keep private text out of Quoli-owned retry files.

### 2. Project deletion leaves retry content behind

**What this is:** `Store.purgeProject()` removes database records and fences ingestion with a tombstone. The bridge retry file is maintained separately and is not removed by this method.

**Problem:** the same synthetic check purged the project and asserted that the spool still contained its prompt. Database deletion alone does not meet the stated lifecycle boundary. The event envelope also carries no lifecycle epoch; stale retry behavior after re-registration needs a regression case.

**Smallest repair:** coordinate project-scoped spool cleanup and producer fencing with deletion and policy transitions, preserving other projects. Reject pre-deletion retry generations after re-registration. Test crash/retry and retention paths. See V03.

**If skipped:** deleted evidence remains on disk in Quoli's spool; stale retries are not fully covered by the advertised deletion guarantee.

## Should fix

### 3. Documentation contradicts delivered behavior

**What this is:** the main planning references guide both owners and agents.

**Problem:** `docs/lifecycle-controls.md` says no durable spool exists, while `apps/bridge/src/spool.ts` persists one. `docs/architecture.md` describes live adapters and graph as future work; they have implementations. `docs/implementation-progress.md` both says a PR stack is unmerged and later says it was merged. The root README says real-project registration is not exposed while documenting the connection command.

**Smallest repair:** reconcile these statements against code and recorded merge/validation evidence. Mark historical plans as historical; keep target capability distinct from delivery. See V04.

**If skipped:** agents may repeat finished work or rely on privacy claims the implementation does not satisfy.

### 4. No tracked CI workflow backs the paid-release gate

**What this is:** package scripts provide lint, type checks, tests, browser checks and release validation locally.

**Problem:** the inspected tree has no `.github` workflow directory. Local validation is useful but does not establish automated PR/release checks required by the vision.

**Smallest repair:** use the existing pinned toolchain and scripts in CI, with synthetic fixtures and artifact inspection. Establish the current baseline rather than claiming existing checks pass. See V05.

**If skipped:** future integrations can regress privacy and evidence behavior without a consistent automated gate.

## Keep, extend, replace, delete or defer

| Area | Decision | Evidence and required change | Drafts |
| --- | --- | --- | --- |
| `packages/schema/src/privacy.ts` and capture defaults | Keep and extend | Existing category controls, bounded text and redaction are reusable; apply them before every persistence boundary, including new fields | V02, V06 |
| `packages/storage` and SQL migrations | Keep and migrate | Append-only triggers, project scoping and transactions are valuable; add v2 compatibility and lifecycle-safe caches | V03, V07 |
| `packages/schema/src/index.ts` | Replace narrow contract incrementally | Source enum is synthetic/Claude/repository; adapter version is literal `0.1.0`; tool vocabulary is Read/Write/Edit/Bash/Other. No structured turns/parent sessions/decisions | V06–V09 |
| `apps/bridge` and `apps/collector/src/otel.ts` | Keep verified behavior; adapt | Hook and OTLP parsing exist; both collapse unknown tool names. Preserve original names and keep source-specific verification | V02, V10, V11 |
| `packages/repository`, collector observer | Keep local implementation | Bounded read-only capture, Git transitions, path protections and explicit races are useful. Add remote observations without claiming local authorship | V12–V14 |
| `packages/repository/src/files.ts` | Extend for approved platforms | File traversal explicitly depends on Linux `/proc/self/fd`; other platforms fail closed. Do not remove the protection for macOS convenience | V30 |
| `packages/analysis` diff/check/reconciliation | Keep and extend | Established evidence rules remain valuable; add request usage, pricing, activity and scenes as bounded projections | V09, V15–V23 |
| Schema/map analysis and `map-view.tsx` | Replace via compatibility | Existing nodes are file/check only. Edges carry evidence and basis, but nodes lack the full proposed scene provenance envelope | V19–V21 |
| Existing session workspace, inspector, settings and landing | Keep and extend | Existing navigation and evidence drill-down remain useful. New views should consume new contracts, not trigger a whole-app rewrite | V17, V18, V20, V24, V25 |
| CLI lifecycle and `scripts/build-release.ts` | Keep; harden for distribution | Local version is `0.1.0-local`; archive/checksum generation exists. Signing, update trust and supported-platform evidence are separate work | V28–V31 |
| Synthetic fixtures and tests | Keep and expand | Existing source-shaped and normalized fixtures support unpaid repeatable checks; add v2 and cross-adapter fixtures | V05–V11, V34 |
| Internal Traceframe package/env/storage names | Keep compatibility | Imports, scripts and persisted settings still use these names. Broad rename is churn and may disconnect existing stores | V04 documentation only |
| Historical issue files and screenshots | Archive only after reference checks | Existing docs link to them. Screenshots occupy about 7 MiB, which alone does not make them junk | V04 |
| Generated build/test outputs | Keep ignored; do not commit | `.gitignore` already excludes outputs, databases and test results. No deletion of runtime data is proposed | V05 release inspection |
| New microservices, broker, general diagram DSL | Do not scaffold runtime code | No demonstrated pilot need; retain existing process/package boundaries and constrained scene format | V01, V19 |
| Hosted sync, accounts, architecture/debt control | Build in sequenced implementation issues | Owner approved hosted dashboard + local connectors; cloud foundations are required, policy enforcement follows evidence validation | C01–C19, A01–A13, V44–V45 |

No source module or dependency was proven unused. There is no justified bulk deletion list. A compatible extension is smaller and safer than replacing the existing evidence engine.

## Capacity boundary to validate

`Store` currently caps retained events at 10,000 and bytes at 50 MiB. `sessions()` selects 50 session groups, and `allEvents()` reads up to 10,000 events; `relationships()` repeatedly filters the event list. These are concrete implementation bounds, not measured performance failures. More harnesses and subagents require explicit cap/omission behavior and a synthetic load benchmark before changing limits. See V26. Do not replace SQLite or add a queue solely on speculation.

Verdict: repair retry privacy and lifecycle guarantees first, then migrate contracts around the working foundation.

Not checked: exhaustive code/dependency audit, concurrency stress reproduction, all tests, fresh-machine runtime, current external integration contracts, macOS certification or a paid release. No code or runtime data was changed by this assessment.
