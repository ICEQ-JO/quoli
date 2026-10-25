# Captured file review

Open **Sessions → Handle an empty cache response → Changes**. The synthetic example compares an already-dirty baseline with a checkpoint: two files change and one remains unchanged. Use **All captured paths** to include unchanged paths, select a file, switch between unified and side-by-side layouts, and follow **Before observation** or **After observation** to its retained event. The metadata-only session demonstrates unavailable sides; the interrupted session demonstrates no captures.

For your own repository, follow [repository capture](repository-capture.md). Capture a baseline, change a disposable file yourself, then capture a checkpoint in the same review. Traceframe only reads the captured versions; opening the dashboard does not inspect new working-tree content, run commands or restore files.

## Comparison semantics

Comparisons are deterministic projections of immutable, project/session-scoped snapshot pairs. Each side carries its snapshot and primary event IDs. The before capture's dirty state is retained separately; it does not establish which actor changed a file. A missing baseline is unavailable, never an invented empty file. Missing entries establish additions/deletions only when the relevant snapshot is complete and stable.

A unique exact sanitized-text match can suggest a rename. This is **inferred**, with its rule shown; ambiguous matches remain separate paths. Redacted path collisions and contradictory fingerprints cannot establish a factual diff. Truncated, redacted, excluded, disabled, binary, oversized or racy sides keep explicit limitations. Matching partial fingerprints can describe retained content but cannot certify the uncaptured original.

The diff preserves line numbers and newline-only changes. Source code and paths render as inert React text. Supporting observations do not establish exclusive authorship, test coverage or feature correctness.

## Symbol grouping

Selected-file details also carry a bounded `symbols` projection for TypeScript, TSX, JavaScript, JSX, `.mts`, `.cts`, `.mjs` and `.cjs`. Tree-sitter parses the available captured sides and groups changed lines under named functions (declarations, `const` arrow and function expressions) and classes/methods. Nested functions and methods use qualified names such as `outer.inner` or `Counter.increment`; a changed line belongs to the innermost containing symbol. Changed lines outside every named symbol are counted as `unattributed`, and unchanged symbols are not listed.

Each group reports `added`, `deleted` or `modified`, before/after line ranges, the exact changed line references (unified with the existing diff lines), `basis: derived`, its generating rule and an uncertainty note. A symbol rename is reported as a deletion plus an addition; Quoli does not infer a semantic rename. Duplicate names are matched in source order. Attribution is line-based, so a one-line file that mixes top-level code and a symbol can attribute the whole changed line to that symbol.

Malformed syntax is explicit: the grouping state becomes `partial`, no symbol groups are claimed, and the file diff remains available. Unsupported paths and missing/incomplete content become `unsupported` or `unavailable`. The parser is bounded to 512 KiB per side, 100,000 syntax nodes and 500 symbols per side; output is capped at 200 groups with an `omitted` count. Files beyond a diff bound inherit that bound. Parsing sanitized captured text locally does not establish runtime impact, ownership or exclusive authorship.

The File changes view still presents the file-level diff while D01 owns the visual system; the grouping API is ready for Story/Impact rendering. The [QUO-58 validation record](work/quo-58-symbol-diffs.md) lists the demonstrated cases and limits.

## Bounds and API

`POST /v1/projects/:project/sessions/:session/changes` accepts a validated comparison query: `beforeId` (nullable), `afterId`, optional `fileId`, `search`, `status`, `cursor` and `limit`. The local browser uses the protected `/api/changes` proxy; credentials stay on the server. Queries have a 4 KiB browser body limit and never place path search or code in URLs. Lists return metadata only; selected-file requests return retained content, bounded line pages and the symbol projection. No browser-supplied filesystem path is resolved.

File lists default to 50 records/page, up to 200. The union is capped at 2,000 paths with omitted counts. Line comparison allows 2,000 lines per side, 1 MiB combined text and four million LCS cells; exceeding a bound produces an explicit unavailable/bounded result, with null line totals. The UI requests 100 lines/page and keeps wide code inside a keyboard-focusable scrolling region. Capture metadata loads newest-first, 50/page; the chooser exposes at most 200 records. Valid selected IDs outside the loaded page remain usable through direct local links.

Project, session, view, capture pair and selected-file IDs survive reload and navigation. Search/filter/layout controls are transient. Selected-file links remain inspectable even when that file is outside the current list filter.

## Validation

Symbol grouping adds 15 cases over the same temporary pairs (modified/added/deleted functions, classes and methods, nested and arrow functions, duplicate method names, malformed syntax, Unicode text, TSX/JavaScript, unsupported languages, large inputs, caps and deterministic output) plus a collector detail assertion. See the [QUO-58 validation record](work/quo-58-symbol-diffs.md).

The change engine has 20 cases covering create/delete/rename, ambiguous matches, dirty/missing/racy baselines, partial content, Unicode/hostile names, newline changes, bounds, pagination and deterministic IDs. Projection tests verify scoped identities, unavailable sides and metadata-only lists. HTTP/browser checks cover credentials, origins, body limits, selection retention through a fresh cookie connection, source links, actual temporary-repository diffs, inert captured HTML, and keyboard focus/width at 390 and 320 pixels.

Desktop (1440 × 1100) and mobile (390 × 844) layouts were inspected together. The one design-detector pass reported palette/type documentation advisories across the shared stylesheet; its oversized output was truncated, so it is not recorded as a clean pass. The inherited visual world is retained; these checks are not accessibility certification or live-agent compatibility certification.

Independent finish review: **PASS**. C1 (small diff line-number contrast) was resolved: unchanged 5.00:1, added 4.95:1 and deleted 5.51:1; line numbers are 10px on desktop/mobile. This was an independent source/screenshot review, not assistive-technology certification. Final [desktop](design/screenshots/captured-changes-desktop.png) and [mobile](design/screenshots/captured-changes-mobile.png) captures show the retained visual system.
