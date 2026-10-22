# 017: Link live sessions to observed repository snapshots and checks

Status: published as [GitHub #18](https://github.com/ICEQ-JO/quoli/issues/18); this file is the local reference. Milestone: M4. Implemented on `feat/live-linking`; see the [live linking guide](../live-linking.md).

## User value

A developer can follow a live agent session into changed files while seeing attribution limits.

## Scope

Wire verified lifecycle/tool observations to bounded read-only snapshot scheduling, diff generation, deterministic linking and map refresh. Add pause/debounce/cap behavior and explicit missing-baseline/race states.

## Non-goals

No atomic filesystem guarantee, auto-commit, restore, agent-authorship guarantee or continuous whole-disk watcher.

## Dependencies

[016](016-source-reconciliation.md)

## Acceptance criteria

- [x] A consented disposable session yields timeline → snapshot pair → diff → map → command evidence navigation.
- [x] Dirty baseline is preserved; Bash/external file changes are observed without falsely treating Edit/Write coverage as exhaustive.
- [x] Overlapping sessions/user edits, collector restart, moving HEAD and missing start produce explicit ambiguous or unavailable relationships.
- [x] Snapshot load is bounded and capture can pause; registered roots and content policies are enforced on every scheduled task.

## Test plan

End-to-end disposable repo scenarios cover normal edit/test, concurrent user edit, Bash rewrite, missed baseline, no code consent, restart and change after check.

## Privacy/security considerations

Never execute recorded commands or mutate Git/index; recheck current policy and deletion fence before artifact writes.

## Relative size

M
