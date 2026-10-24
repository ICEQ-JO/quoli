<!-- impeccable:product-schema 1 -->

> Local implementation/validation reference. The [hosted product vision](../../docs/vision.md) supersedes local-only product scope; dated checks below are historical evidence, not cloud readiness.
# Quoli

## Platform and audience
A local-first web application for one developer reviewing coding work on one local Git repository per project. Next.js and TypeScript run locally alongside a loopback collector. Synthetic demo sessions require no paid agent API. The source preview has a CLI and managed local production runtime; package distribution remains unpublished.

## Purpose
Show what the coding agent did, what changed, and what remains unverified. Append-only session event history is the primary record; explanations, metrics and maps are derived views. Repository observation works independently of the agent or editor. Detailed live activity currently comes from the optional Claude Code integration.

## Positioning and operating context
An evidence workspace used beside an editor, with readable dark/light themes and narrow-screen review. Clear inspection and explicit uncertainty matter more than promotional claims. Quoli is both the product and repository name, formerly Traceframe.

## Current capabilities
The runnable application includes clearly labeled synthetic sessions, a searchable grouped session work list, session review documents, source-linked capture-gap triage, retained activity search/filtering/pagination, source/receipt ordering, inspectable payloads and provenance, explicit-ID tool links, reported token/cache usage and capture coverage. Bounded file comparisons show before/after availability and inferred rename limits. Recorded verification evidence, a bounded change map and cross-source reconciliation connect available records without creating a correctness verdict.

A repository-only connection observes local Git history independently of agent hooks, retaining a baseline and later bounded checkpoints with separate code and untracked-file consent. Capture controls, retention and deletion remain local. Detailed Claude Code collection uses a passive hook bridge and narrow reported-usage receiver with guided reversible setup. Live collection was verified against Claude Code 2.1.306; this is not a promise of support for every version. Detailed activity adapters beyond Claude remain planned.

Sessions and Overview include an inert connection guide with source/installed CLI command choices, code capture off by default and clipboard recovery. Overview summarizes the selected page of up to 50 retained sessions and routes recorded gaps to filtered Activity. Newer/older page controls expose the total retained sessions; counts, filters and queues cover that page only. Summary/map/settings failures offer retry without turning unavailable counts into zero. Review defers joined-source detail to a disclosure. Coverage distinguishes fixtures, repository observation and available session sources without claiming a live connection. Settings separates immediate policy/pause changes from explicitly applied retention and confirmed deletion; successful deletion shows actual removed counts and stops project capture/storage.

The landing at `/landing` introduces the product through a three-tab synthetic evidence example, truthful source-preview setup, privacy/capture boundaries and working workspace links. It is illustrative, not a live collection view. See [the landing reference](../../docs/design/landing-page.md).

## Constraints and commitments
Local storage, no outbound session upload and credential-protected local ingestion. Capture controls and redaction apply before persistence. Captured text is untrusted data and must never be executed or replayed. Preserve provenance, recorded/derived/inferred distinctions, redaction/capture-state markers and null unknowns. A successful command does not establish feature correctness; absent evidence does not establish absence. Never claim hidden reasoning, complete capture, precise file costs or exclusive authorship. No cloud dependency, billing, organizations or productivity scores in this increment. The fresh-machine pilot remains the owner's check.

## Design authority
The owner authorized the whole-product design reset under QUO-82 and chose D — Evidence Field. The landing implements that identity under QUO-83. For the delivered workspace, the owner approved B — Document first on 2026-10-24 under QUO-84: black/white fields, locally bundled Inter, restrained Instrument Serif italic session titles, stable navigation, ruled review sections and contextual source inspection. Preserve current behavior, privacy and evidence distinctions; generated mock controls are not product requirements. See [the workspace adoption record](../../docs/design/workspace-evidence-field.md) and DESIGN.md for implementation and validation. Documentation is revisable with evidence.
