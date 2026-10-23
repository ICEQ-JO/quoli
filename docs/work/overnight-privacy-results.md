# Overnight privacy and lifecycle results

> Working record for the bounded overnight packet [Agent 1 — overnight retry privacy and lifecycle repairs](../handoffs/agent-1-privacy.md). Dated results certify only the checks listed here.

## Issues and branches

| Increment | Linear | Branch | Pull request | Status |
| --- | --- | --- | --- | --- |
| V02 — policy before retry persistence | [QUO-39](https://linear.app/quolii/issue/QUO-39/v02-apply-project-capture-policy-before-retry-persistence) | `feat/quo-39-retry-capture-policy` | [#59](https://github.com/ICEQ-JO/quoli/pull/59) | Implemented, in review; not merged |
| V03 — fence and remove retries | [QUO-40](https://linear.app/quolii/issue/QUO-40/v03-fence-and-remove-retries-during-project-lifecycle-changes) | `feat/quo-40-retry-lifecycle` | [#62](https://github.com/ICEQ-JO/quoli/pull/62) (draft) | Implemented as a stacked draft; blocked by #59 |

Both branches are based on [#58](https://github.com/ICEQ-JO/quoli/pull/58) `docs/vision-backlog-scaffold`, which is still open and unmerged. PR #59 therefore targets that branch, not `main`; #62 targets #59.

## QUO-39 — apply project capture policy before retry persistence

Commit: `1913f49` (`fix(bridge): apply capture policy before retry persistence`), author and committer ICEQ-JO.

### Demonstrated behavior

- `apps/bridge/src/spool.ts` applies the project policy at the durable write, using a read-only SQLite connection from the hook process (`packages/storage/src/policy.ts`). The hook never opens a writer.
- Default policy (all classes off) with the collector unreachable: prompt, tool and nested tool output canaries never appear in `bridge-spool.jsonl`; each event is stored with `content.text = null` and state `disabled`.
- Explicitly enabled prompt/tool/code: the prompt and nested tool output are retained in the spool after the offline failure, with state `present`.
- Nested tool output with only `tool` enabled is withheld (both `tool` and `code` are required).
- An excluded path (`/synthetic/.env`) loses both the recorded path and the content.
- A paused project writes no retry at all, so a later resume cannot resurrect the observation.
- An unreadable policy (no store) keeps the event metadata with state `unavailable` and no text.
- Malformed JSON and payloads above the 1 MiB stdin bound leave no spool entry and no stdout.
- Every case runs the real hook subprocess with an unreachable port and asserts empty stdout and exit 0.

### Checks

| Check | Command | Result |
| --- | --- | --- |
| Focused bridge tests | `node --import tsx --test tests/bridge.test.ts` | 15 pass, 0 fail |
| Full unit/integration suite | `pnpm test` | 127 pass, 0 fail, 4 skipped (release/e2e suites requiring `QUOLI_RELEASE_TEST` or browsers) |
| Type check | `pnpm typecheck` | pass |
| Lint | `pnpm lint` | no errors; 3 pre-existing warnings outside this diff |

Environment: Node 24.16.0, pnpm 11.12.0, isolated worktree at `~/Dev/quoli-night-privacy`, synthetic fixtures only.

### Unsupported and residual cases

- A retry written under a permissive policy is not rewritten by this increment when the policy tightens later; the collector re-sanitizes on delivery. Purge does not remove earlier retry entries here. [QUO-40](https://linear.app/quolii/issue/QUO-40/v03-fence-and-remove-retries-during-project-lifecycle-changes) fixes both in the stacked draft #62.
- The policy read and the spool write are not atomic with an owner settings change. A tightening in that window is caught by collector revalidation and by #62's cleanup and drain revalidation, but text can remain in the spool until then.
- Concurrent hook processes still share the existing read-modify-write JSONL spool race in this increment. #62 adds a lock.
- No live Claude Code session was recaptured; the runtime report's 2.1.306 observations predate this change.

## QUO-40 — fence and remove retries during project lifecycle changes

Commit: `66b01ff` (`fix(storage): fence and prune retries across project lifecycle`), author and committer ICEQ-JO. Follow-ups: `51013d0` and `b15bc61` (validation record), `6b98c34` (a spool cleanup failure no longer fails an already-committed lifecycle action). Stacked draft [#62](https://github.com/ICEQ-JO/quoli/pull/62) against the QUO-39 branch. The Linear dependency on QUO-39 stays open: an unmerged draft is not a completed prerequisite.

### Demonstrated behavior

- Each spool entry records the project lifecycle `epoch`. The purge endpoint removes that project's live and interrupted-drain entries; unrelated project entries remain.
- A purge without spool cleanup (simulating a stale writer) is still fenced: after re-registration, drain drops the old-generation entry. A pre-fencing bare event is dropped too.
- Cleanup covers an interrupted drain's rotated file and is idempotent on repeat.
- A policy reduction through the real settings endpoint scrubs that project's pending prompt content to `disabled` with no text; another project's identical content stays.
- A retention window removes expired pending entries through the same endpoint.
- Eight concurrent hook subprocesses plus a purge keep the other project's four entries intact; drain delivers none for the purged project.
- Drain revalidates policy, pause state, retention and epoch before each send, and reports delivered, kept and dropped counts.
- A damaged or malformed spool line is dropped without blocking delivery of the valid entries.

### Checks

| Check | Command | Result |
| --- | --- | --- |
| Focused lifecycle tests | `node --import tsx --test tests/retry-lifecycle.test.ts` | 7 pass, 0 fail |
| Focused bridge tests | `node --import tsx --test tests/bridge.test.ts` | 15 pass, 0 fail |
| Full unit/integration suite | `pnpm test` | 134 pass, 0 fail, 4 skipped (release/e2e suites requiring `QUOLI_RELEASE_TEST` or browsers) |
| Type check | `pnpm typecheck` | pass |
| Lint | `pnpm lint` | no errors; 3 pre-existing warnings outside this diff |
| Packaged release | `pnpm release:local` then `pnpm test:release` | 4 pass, 0 fail (19 s relocated install/capture/restart/uninstall, startup guards, supervisor crash recovery, install guards) |

The packaged release was built from this branch, so it also exercises the QUO-39 hook bundle with the moved spool module.

Environment: Node 24.16.0, pnpm 11.12.0, isolated worktree at `~/Dev/quoli-night-lifecycle`, synthetic fixtures only.

### Unsupported and residual cases

- Delivery is at-least-once: a crash during drain or two concurrent drains can re-deliver an entry. The collector deduplicates by delivery ID, so evidence is not duplicated.
- Spool cleanup is best-effort under lock contention (100 ms). A purge that cannot take the lock leaves entries, but the new generation fences them at the next drain. A cleanup failure increments the collector health counter and does not fail the already-committed lifecycle action; the purge API reports database counts only.
- The lock is a local file lock for one machine, not a distributed one.
- No live Claude Code session was recaptured.

## Blockers and next safe action

- No external blocker forced a stop. Merging is not authorized; owner review of #59 remains, and #62 stays a draft until #59 is merged.
- Next safe action: review and merge #58, then #59, then rebase #62 onto the updated parent, re-run the focused and full checks, and review it. Do not merge either privacy PR on the agent's judgment.
