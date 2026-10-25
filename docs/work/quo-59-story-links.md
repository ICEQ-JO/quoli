# QUO-59 validation record — Story symbol/hunk linkage

Date: 2026-10-26. Local Linux validation with synthetic captured text; no real private repository, session or credential was used.

## Implemented

- `packages/analysis/src/story-changes.ts`: converts a complete `FileChange[]` comparison into Story file observations. It derives symbol groups through the QUO-58 bounded parser, one hunk per contiguous run of changed lines, exact before/after ranges, and cites both captured evidence ids.
- `packages/analysis/src/story.ts`: emits `symbol` and `hunk` nodes, `changed` edges from the file and from each containing symbol to a hunk, exact recorded-path `touched` edges from tool calls to files, `unknown_attribution` and `syntax_unavailable` gaps, and `symbols`, `hunks` and `attribution` claims. No timestamp or directory proximity is used as a join key.
- `packages/schema/src/story.ts`: adds the `symbols`, `hunks` and `attribution` claim kinds additively under Story version 1. No persisted Story exists, so there is no migration.
- `packages/analysis/src/index.ts`: exports the comparison-to-Story bridge.
- Tests: `tests/story-links.test.ts` (8 cases) alongside the existing Story tests.

## Demonstrated result

A synthetic `src/cache.ts` pair changing one `loadCache` return line produces one `symbol` node (`modified`, exact parsed range) and one `hunk` node (`before 2 · after 2`). The file and symbol each link to the hunk with `changed`; both cite `story-obs-before` and `story-obs-after`. The root session's recorded tool path `src/cache.ts` gets one `touched` edge whose evidence cites the tool call and both captures. The child session also recorded the same path, but the parent Story filters it out: only the parent tool node exists.

A changed path with no exact recorded tool path gets no `touched` edge, an `unknown_attribution` gap and an `attribution` claim stating that path or time proximity is not proof of causation. A captured rename source path links the recorded old path to the new file node; the edge still denies that the call caused the change. An unsupported Python path and a malformed TypeScript pair keep their exact hunks, emit no symbol node, and add a `syntax_unavailable` gap naming the state and reason. Deleting `story-obs-before` from the caller's known evidence makes `unknownSceneEvidence` report it.

## Commands and outcomes

```sh
node --import tsx --test tests/story.test.ts tests/story-links.test.ts
# 15 pass / 0 fail

pnpm typecheck
# pass (root tsc and Next web typecheck)

pnpm lint
# pass; 17 warnings and 4 infos, all pre-existing diagnostics

pnpm test
# 328 tests: 316 pass, 7 fail, 5 skipped; the same seven release-signing/update tests fail on main
```

## Limits and unsupported cases

- The Story projection still has no collector route or view. V21 owns the Story rendering, so this increment delivers the cited projection contract rather than a new visual surface.
- A tool-path join requires exact string equality with the after path or a captured rename source path. It is an association only: the call may have read rather than written the path, may have run before or after the change, or may have failed. No tool-to-hunk or tool-to-symbol edge is emitted. The event schema has no change-to-tool id, so this is a named shortcut rather than a foreign-key join.
- The projection filters tool calls to the story's session, but it cannot verify that the caller's comparison belongs to that session. The caller owns that scope.
- Hunks are contiguous runs of changed lines in the complete diff. A bounded or unavailable diff emits no hunks; the file node and its state remain.
- Symbol coverage and bounds are inherited from QUO-58: TS/JS/TSX/JSX only, no symbols on parse errors, 512 KiB per side, 100,000 nodes, 500 symbols per side and 200 groups. `partial`, `unsupported`, `bounded` and `unavailable` states surface as `syntax_unavailable` gaps.
- The additive claim kinds require a Story consumer to accept them. No persisted Story or consumer exists yet.
- No live external service, real private session or repository content is involved.
