# 008: Capture a read-only baseline from a disposable Git repository

Status: published as [GitHub #9](https://github.com/ICEQ-JO/quoli/issues/9); this file is the local reference. Milestone: M2.

## User value

A developer can compare observed working-tree states instead of assuming HEAD was the starting point.

## Scope

Implement explicit project root registration, safe Git inspection and bounded snapshots of HEAD/index/working tree. Capture staged/unstaged changes and consented untracked text; persist sanitized artifacts and snapshot observations.

## Non-goals

No live hook trigger, file restoration, Git writes, submodule traversal or exclusive agent authorship.

## Dependencies

[005](005-local-ingestion.md)

## Acceptance criteria

- [ ] Dirty baseline, unborn HEAD, missing baseline, allowed untracked files and moved HEAD are explicit states.
- [ ] Symlinks, ignored/excluded files, binary/oversized content and concurrent reads are bounded and marked.
- [ ] Git runs with fixed arguments and disabled external diff/textconv; hooks, commands from captures and user filters are never executed.
- [ ] Snapshotting does not change repository content/index and cannot read outside the registered root.

## Test plan

Use temporary Git fixtures with staged/unstaged/untracked/deleted files, hostile paths, symlinks, submodules, missing Git and concurrent writers; compare repository state before/after.

## Privacy/security considerations

Code consent and redaction precede artifact persistence; never retain excluded content or private absolute paths unnecessarily.

## Relative size

M
