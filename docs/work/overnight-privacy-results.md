# Overnight privacy and lifecycle results

> Working record for the bounded overnight packet [Agent 1 — overnight retry privacy and lifecycle repairs](../handoffs/agent-1-privacy.md). Dated results certify only the checks listed here.

## Issues and branches

| Increment | Linear | Branch | Pull request | Status |
| --- | --- | --- | --- | --- |
| V02 — policy before retry persistence | [QUO-39](https://linear.app/quolii/issue/QUO-39/v02-apply-project-capture-policy-before-retry-persistence) | `feat/quo-39-retry-capture-policy` | [#59](https://github.com/ICEQ-JO/quoli/pull/59) | Implemented, in review; not merged |
| V03 — fence and remove retries | [QUO-40](https://linear.app/quolii/issue/QUO-40/v03-fence-and-remove-retries-during-project-lifecycle-changes) | `feat/quo-40-retry-lifecycle` | — | Not started |

Both branches are based on [#58](https://github.com/ICEQ-JO/quoli/pull/58) `docs/vision-backlog-scaffold`, which is still open and unmerged. PR #59 therefore targets that branch, not `main`.

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

- A retry written under a permissive policy is not rewritten when the policy tightens later; the collector re-sanitizes on delivery. Purge does not remove earlier retry entries. [QUO-40](https://linear.app/quolii/issue/QUO-40/v03-fence-and-remove-retries-during-project-lifecycle-changes) covers both.
- The policy read and the spool write are not atomic with an owner settings change. A tightening in that window is caught by collector revalidation, but text can remain in the spool until the next drain.
- Concurrent hook processes still share the existing read-modify-write JSONL spool race. Not changed by this increment.
- No live Claude Code session was recaptured; the runtime report's 2.1.306 observations predate this change.

## Blockers and next safe action

- No external blocker forced a stop. Merging is not authorized; owner review of #59 remains.
- Next safe action: review #59, then let [QUO-40](https://linear.app/quolii/issue/QUO-40/v03-fence-and-remove-retries-during-project-lifecycle-changes) build on it for purge/retention-aware spool cleanup and generation fencing.
