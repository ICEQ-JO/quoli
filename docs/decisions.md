# Product and architecture decisions

## 2026-10-23 — Hosted dashboard with local connectors

Owner direction in the planning conversation: users work in local coding agents and see their evidence in Quoli's cloud dashboard. This supersedes the earlier local-dashboard-only pilot and deferred-cloud proposals.

Settled direction: cloud accounts/workspaces and local connector pairing/sync are foundational; OpenCode, Pi, Claude Code and Codex are target adapters; token attribution, extension use and evidence scenes are core; architecture integrity and technical debt have concrete implementation work after evidence validation. The first evidence pilot can precede policy enforcement. Native evidence scenes remain the source of truth; deterministic rules decide policy.

Rationale: the owner wants a SaaS product that works across locally running agents, not merely a local viewer. Earlier drafts under-scaffolded cloud and architecture work.

Consequences: add tenant isolation, separate capture/upload consent, secure device identity, durable sync, cloud lifecycle/operations and hosted query/dashboard issues. Retain useful local storage/capture/diff code. Product approval does not authorize automatic upload of existing private data.

## 2026-10-23 — Landing direction D: the evidence field

The owner chose a supplied black/Inter/Instrument Serif landing reference over the three D01 gate directions (A survey field book, B phosphor terminal, C one-bit desktop). The landing now uses direction **D — The Evidence Field**: pure black, locally bundled Inter with an Instrument Serif italic accent, liquid-metal navigation pills, a drawn synthetic evidence constellation and a three-beat pipeline row.

Rationale: the owner preferred the reference's restraint and typographic contrast. The template's fabricated social proof ("4.2M+ workflows", "92% reduction", "180+ teams") and external hero video were rejected; the page uses the product pipeline, a local synthetic visual and explicit "in development" labels instead.

Consequences: the landing is dark-only and scoped with `--q-*` tokens; the workspace retained Geist/fern until the QUO-84 adoption below. The landing's anchor navigation hides below 900px and the footer carries the section links. Recorded in [directions/d01](design/directions/d01/README.md) and implemented under QUO-83.

## Hosted pilot decisions

[Hosted pilot](hosted-pilot.md) records the owner's choices for the first paid buyer, the USD 19 per-seat monthly Pilot plan, connector platforms (Linux x64 and macOS 14+, Windows excluded), the 90-day cloud retention default and the launch success criteria. Trial and plan limits, cancellation/refund, hosting region and data residency, auth/payment vendors and initial policy rules remain open; the record names the owner and follow-on issue for each. Do not mistake proposed vendors, code layouts or dates for owner-approved implementation. Enterprise SSO, more languages, optional model summaries and self-hosting remain later gated increments.

## Documentation cleanup

The original GitHub MVP issues remain historical delivery records. Their duplicated local issue bodies and obsolete empty-repository plan are removed in favor of the [checkpoint](implementation-progress.md), [runtime references](README.md) and [active Linear-backed backlog](issues/vision/README.md). Earlier visual proposal documents are superseded by the implemented session workspace and current visual system; validation evidence is retained.

## 2026-10-24 — Document-first Evidence Field workspace

The owner approved composition **B — Document first** for QUO-84 within direction D. Retain stable global navigation, prioritize the captured request and ruled evidence sections, and open exact source inspection contextually. Carry local Inter and black/white neutral planes across delivered workspace surfaces, with Instrument Serif italic only on session titles and semantic color for evidence states. Light mode remains supported.

Rationale: the document gives review a readable center without another persistent session-list rail. Existing evidence, URLs, capture consent and lifecycle behavior remain authoritative. The generated mock’s Run check, global search and invented provenance are excluded. See [the workspace adoption record](design/workspace-evidence-field.md). This does not complete the hosted product or all of parent QUO-82.

## 2026-10-26 — Tree-sitter WASM for syntax-aware symbol diffs

The owner approved adding `@vscode/tree-sitter-wasm` (0.3.1, MIT) for QUO-58, resolving the earlier no-new-dependency constraint for this capability. The vision names bounded tree-sitter parsing, and the issue requires verifying it.

Rationale: WASM avoids a native toolchain and platform builds; the runtime and the TypeScript/TSX grammars are copied as assets so the esbuild collector bundle stays small and works without `node_modules`. Parsing is bounded and operates only on sanitized captured text; parse-error files fall back to the file diff.

Consequences: the release now carries `runtime/wasm/` (about 3 MB). The package is a runtime dependency of `@traceframe/analysis`; upgrading tree-sitter requires re-copying matching runtime and grammar assets. No execution, call graph, authorship or semantic-rename claim is added.

## 2026-10-26 — Story links by exact path only

QUO-59 adds cited symbols and hunks to the Story projection. The event schema has no change-to-tool id, so a recorded tool call joins a changed path only through exact recorded path equality with the after path or a captured rename source path. The edge is `touched`, never `changed`; its claim and uncertainty state that the association does not establish causation, timing or authorship, and unmatched paths keep an `unknown_attribution` gap.

Rationale: path or time proximity must not become a causal fact. An explicit weak association is more useful and more honest than inventing a tool-to-hunk edge, while the file, symbol and hunk chain stays grounded in the comparison's own ids and both captured evidence sides.

Consequences: a `shortcut:` comment marks the join for replacement when captured changes carry tool ids. The Story still has no collector route or view; V21 renders the projection. Additive `symbols`, `hunks` and `attribution` claim kinds require a Story consumer to accept them.
