# QUO-58 validation record — syntax-aware TypeScript/JavaScript symbol grouping

Date: 2026-10-26. Local Linux validation with synthetic captured text; no real private repository, session or credential was used.

## Implemented

- `packages/analysis/src/symbols.ts`: bounded tree-sitter parsing of captured TypeScript, TSX, JavaScript, JSX, `.mts`, `.cts`, `.mjs` and `.cjs`; named function/class/method extraction; innermost changed-line attribution; added/deleted/modified groups with exact line references; explicit `partial`/`unsupported`/`bounded`/`unavailable` states.
- `packages/analysis/src/diff.ts`: `diffAll` computes every changed line once and `diffPage` pages it, so symbol attribution and the existing bounded API page share one diff.
- `packages/schema/src/changes.ts`: selected-file details now carry `symbols` with groups, before/after ranges, changed-line references, language, unattributed and omitted counts.
- `apps/collector/src/changes.ts`: returns the symbol projection alongside the paged diff.
- `scripts/build-release.ts`: copies the tree-sitter runtime (`tree-sitter.js`) and the TypeScript/TSX grammar WASM into `runtime/wasm/`.
- `packages/analysis/package.json`: adds `@vscode/tree-sitter-wasm` 0.3.1 (MIT).
- Tests: `tests/symbols.test.ts` (15) and a collector detail assertion in `tests/changes.test.ts`.

## Demonstrated result

A captured pair changing one line of `add` reports one `add`/`modified` group with before and after line 1–3 and exactly the changed line 2; the changed line is attributed on both sides. A class change reports only the innermost `Counter.increment`, not the unchanged method or the class. Nested functions report `outer.inner`; `const` arrow functions report the variable; duplicate method names stay separate (`B.run`). Added and deleted functions use the side that exists. A renamed symbol is a `deleted` group for the old name and an `added` group for the new name, with an uncertainty that no semantic rename is inferred.

A malformed after side returns `partial`, no groups and an explicit reason while the unchanged file diff remains available. Unicode before the function does not shift the range. TSX and JavaScript record their language. Python is `unsupported`; a top-level-only change reports `unattributed: 2`. A file above 512 KiB is `bounded`; 501 functions are `bounded`; 250 groups are capped at 200 with `omitted: 50`. The collector detail keeps a one-line diff page while returning the complete symbol grouping.

## Commands and outcomes

```sh
node --import tsx --test tests/symbols.test.ts
# 15 pass / 0 fail

node --import tsx --test tests/symbols.test.ts tests/changes.test.ts
# 19 pass / 0 fail

node --import tsx --test tests/diff.test.ts tests/changes.test.ts tests/collector.test.ts tests/symbols.test.ts
# 41 pass / 0 fail

pnpm typecheck
# pass (root tsc and Next web typecheck)

pnpm lint
# pass; 17 warnings and 4 infos, all pre-existing diagnostics

pnpm test
# 320 tests: 308 pass, 7 fail, 5 skipped; the same seven release-signing/update tests fail on main

pnpm release:local   # Node 24.16.0
# 1341 files, local unsigned; runtime/wasm contains tree-sitter.js, tree-sitter.wasm,
# tree-sitter-typescript.wasm and tree-sitter-tsx.wasm (about 3.1 MB)

TRACEFRAME_DATA_DIR=/tmp/... TRACEFRAME_COLLECTOR_PORT=4399 node dist/quoli/runtime/collector.mjs
# "Quoli collector ready on 127.0.0.1:4399 (local preview)"
```

A standalone esbuild bundle of `symbols.ts` in a directory with only `runtime/wasm/` (no `node_modules`) parsed a synthetic change and returned the `f` group with two changed lines, verifying the copied runtime/grammar path.

## Limits and unsupported cases

- The File changes view still renders the file-level diff. D01 owns the visual system, so the delivered surface is the selected-file `symbols` projection for Story/Impact rendering, not a new visual grouping.
- Syntax errors claim no symbols at all for that file (`partial`); the file diff remains. This is conservative and avoids a false deleted/added group from a recoverable error tree.
- Attribution is line-based. A changed line that mixes top-level code and a symbol on a one-line file can be attributed to the symbol. Lines inside a comment within a function/class are attributed to that symbol.
- Duplicate names are matched in source order and suffixed (`f#2`); a name change can shift those suffixes. Namespaces and object-literal methods are not qualified as enclosing symbols. A semantic symbol rename is a deletion plus an addition; file renames are only inferred by the existing diff engine when sanitized content is identical, and a content-changing rename appears as an add/delete.
- Supported languages are the TS/JS family listed above. `.vue`, `.svelte`, JSON and other languages fall back to the file diff. No whole-repository call graph, runtime impact, authorship or feature-correctness claim is made.
- Bounds: 512 KiB per side, 100,000 syntax nodes, 500 symbols per side and 200 groups with an `omitted` count. Files beyond the existing diff bounds inherit that state. Tree-sitter parse time is not preempted on adversarial input beyond the input-byte cap.
- Tree-sitter WASM is new; macOS/Windows packaging and runtime behavior are not certified here (QUO-66). The release copies matching runtime/grammar assets; a dependency upgrade must keep them in step.
- No live external service is involved. This is a local, read-only projection of sanitized captured text, and parsing does not prove that a change ran or that a named symbol was invoked.
