# Quoli product vision

Owner direction recorded: 2026-10-23. Status: **target direction, not delivered capability.**

This page is the north star for product work. It describes what Quoli is trying to become for paying customers. It does not replace the [implementation checkpoint](implementation-progress.md), which records what actually runs today. If this page and the implementation disagree, the implementation is the truth about today; this page is the truth about where we are going.

## One sentence

Quoli should be the privacy-preserving, cross-agent evidence and understanding workspace that shows a developer what an AI coding agent did, what changed, what it cost, what it used, and what remains unverified — with diagrams that explain changes instead of only listing them.

## The owner's ask, in the owner's terms

1. **Connect to cloud repositories**, not only local Git roots.
2. **Work with whatever harness the developer uses** — OpenCode, Pi, Claude Code, Codex and future tools.
3. **Track every tool call, every decision, every user prompt and every subagent.** The product boundary for “decision” is defined under Pillar 3: observable and declared decisions, never hidden reasoning.
4. **Track token spend**: how many tokens, of which kind, and what they were spent on.
5. **Track the plugins and skills that were used.**
6. **Provide a diagramming language that makes sense** and helps developers understand code changes and diffs.
7. **Make the result good enough that developers and teams will pay for it.**

The rest of this document defines what those asks mean in a product that keeps Quoli's evidence guarantees.

## Target customer outcome

A developer can connect a repository, keep working in any supported agent, and later answer four questions without rereading the whole transcript:

- What did the agent actually do?
- What changed, and what evidence explains the change?
- What did it cost, and which model, turn, tool or subagent consumed the budget?
- What is still unknown or unverified?

A team lead or reviewer can use the same record to review AI-assisted work without receiving the whole session, the prompt history or the source code.

## Product pillars

Every future issue and pull request must name the pillar or commercial gate it advances. Work that advances none of them needs explicit owner approval.

### Pillar 1 — Repositories anywhere

**Customer outcome:** connect a local repository or a cloud repository (GitHub first, then GitLab/Bitbucket) and review its observed history.

**Required capabilities:** provider abstraction; OAuth or least-privilege tokens; short-lived credentials in the OS keychain; branch/commit/PR selection; bounded tree, blob and comparison reads; local caching; rate-limit and partial-fetch states; read-only guarantees.

**Truth boundary:** a remote read is an observation of the provider's response, not a complete audit of the repository. Unfetched paths, denied scopes and truncated responses remain unknown.

**Privacy boundary:** the default architecture is local-first remote fetch. If code is ever stored in a hosted service, that is a separate product and security decision.

### Pillar 2 — Any harness

**Customer outcome:** use the agent the developer already uses and still get a coherent Quoli record.

**Required capabilities:** one adapter contract; per-adapter versioning; a published capability matrix; installers and reversible removal; synthetic fixtures; version gates; explicit gaps for unsupported fields.

**Harness order:** an open decision, not settled by this document. Any order must verify official contracts and ship with fixtures before claiming support.

**Truth boundary:** adapters capture what the harness exposes. Some harnesses will never expose hidden reasoning, exact exit codes, complete subagent scope or per-request usage. Quoli shows the capability and the gap; it does not fabricate parity.

### Pillar 3 — Complete observable activity

**Customer outcome:** see prompts, turns, tool calls, tool results, declared plans/decisions, approvals, subagents and user corrections in one trace.

**Required capabilities:** schema support for turns, decision/plan/approval events, open tool names with normalized categories, parent/child sessions, subagent scope, spawn provenance and capability state on every field.

**Definition of “decision”:** a decision is a plan, rationale, approval, todo change or correction the harness actually emitted, or a derived grouping clearly marked as derived. It is never hidden chain-of-thought and never a reconstructed certainty.

**Truth boundary:** “every tool call the source exposes” is the promise. “Every decision the agent made” is not a promise. Missing items become explicit gaps, not silent omissions.

### Pillar 4 — Token cost and attribution

**Customer outcome:** understand token spend by session, turn, model, request, subagent and tool call, with the formula visible.

**Required capabilities:** per-request usage observations; input, output, cache-read, cache-write and reasoning tokens where reported; a versioned model-price catalog with effective dates and currency; provider-reported cost when available; cumulative/delta reconciliation; duplicate handling; unpriced-model states; list-price estimates separated from subscription cost.

**Truth boundary:** cost is an **estimate**, not an invoice. File-level allocation is not claimed unless the source reports it. Unknown token categories stay null. Price changes are versioned so old views remain explainable.

### Pillar 5 — Plugins and skills

**Customer outcome:** see which plugins, skills, MCP servers and commands were installed and which were actually invoked.

**Required capabilities:** an inventory at session start or connection time; invocation events with name, version, source and status; links to the tool calls and prompts they served; harness-specific discovery that is read-only and consented.

**Truth boundary:** installed is not invoked. Invoked is not necessarily effective. Opaque plugin internals remain opaque.

### Pillar 6 — An evidence-grounded change language

**Customer outcome:** a developer can understand a change through a diagram and a short narrative that cite the evidence behind them.

**Required shape:** a versioned scene schema with a constrained vocabulary. Proposed node kinds: `turn`, `prompt`, `decision`, `subagent`, `tool`, `file`, `symbol`, `hunk`, `check`, `gap`, `cost`, `capability`. Proposed edge kinds: `prompted`, `declared`, `spawned`, `invoked`, `touched`, `changed`, `verified`, `failed`, `cost_of`, `used`.

Every node and edge carries:

- `basis`: `recorded`, `derived` or `inferred`;
- the rule that produced it;
- supporting evidence IDs;
- an uncertainty statement.

**Views:** Story (request → declared plan/decision → subagent/tool sequence → files → checks → unknowns), Impact (repository/module/file/symbol), Cost (session/turn/model/subagent) and Timeline (concurrency, retries, subagents, long-running tools).

**Diff understanding:** syntax-aware changes through tree-sitter for supported languages; symbol-level grouping; hunk-to-tool-call and hunk-to-prompt links only where IDs support them; “why” only where a declared decision exists.

**Language rule:** deterministic, evidence-cited narrative first. An optional model-written summary may be added only with citations and must never replace the deterministic view.

**Truth boundary:** this is a constrained evidence scene format, not a general-purpose diagramming DSL. Mermaid or another external format may be an export, not the source of truth. No diagram may imply authorship, test coverage or correctness without evidence.

### Pillar 7 — Architecture and policy guardrail (deferred)

This pillar records a later direction proposed by the owner's friend. It is **not part of the initial paid pilot** and must not displace the evidence and understanding work above. Revisit it only after the earlier product has paying validation and a narrow buyer.

**Customer outcome:** a team can gate agent-created changes on architecture and policy integrity before merge, with evidence explaining the decision.

**Required capabilities:** a GitHub/GitLab app; a versioned architecture model of modules, dependencies, ownership boundaries, database schema and approved patterns; team rules-as-code; diff, dependency, schema, duplication and blast-radius analysis; agent provenance from Quoli; a pass/warn/block report with evidence and a machine-readable fix request; a technical-debt ledger with owner, reason, expiry and follow-up.

**Truth boundary:** this is a **policy gate**, not a safety certification. Deterministic rules and recorded evidence make the decision; a model may explain or suggest, never gate. A PR with no agent provenance is still reviewable, but it must not be labeled agent-created. False positives are a product defect, not an acceptable cost.

**Commercial boundary:** the buyer is a team, not an individual developer. This direction implies a hosted GitHub/GitLab control plane, webhooks, repository analysis and a much larger security and compliance surface. A self-hosted option may be required for privacy-sensitive customers.

## Commercial-readiness gates

A good local tool is not automatically a good paid product. These gates are part of the vision, not an afterthought.

| Gate | What it means |
| --- | --- |
| Distribution | Signed, versioned downloads; supported platforms; a safe update path |
| Platforms | Linux and macOS at launch; Windows either supported or explicitly excluded |
| Licensing and billing | A way to pay, a license, trials, refunds and plan limits |
| Onboarding | Detect harnesses, connect a repository, seed a useful first review |
| Support | A support channel, documentation, status and recovery guidance |
| Legal and trust | EULA, privacy policy, security page, vulnerability disclosure, dependency hygiene |
| Data controls | Export, deletion, retention defaults, token storage, audit of access |
| CI and release discipline | Automated checks and reproducible releases before charging money |
| Observability | Opt-in crash and usage reporting, with no private code in the payload |
| Team readiness | Accounts, roles and sharing only when paying customers need them |

## Alignment rule

1. Every issue and pull request names the pillar(s) or commercial gate it advances.
2. A task that fits no pillar needs explicit owner approval before implementation.
3. A feature that would weaken a truth boundary is a product change, not an implementation detail; surface it.
4. Documentation distinguishes target direction from delivered capability.
5. When the owner changes direction, update this page and record the decision rather than leaving stale guidance.

## Proposed sequence

This is a sequencing proposal, not a delivery commitment.

1. **Foundation:** schema v2, adapter contract, price-catalog contract, scene schema, CI, licensing and distribution decisions.
2. **Paid pilot:** GitHub read-only, Claude Code + OpenCode, subagent tree, declared decisions, cost dashboard, plugin/skill inventory, Story diagram, syntax-aware diff for a small language set, export, billing and signed updates.
3. **Broaden:** GitLab/Bitbucket, Codex/Pi, more languages, shared read-only reviews, macOS maturity.
4. **Team/enterprise:** hosted sync, roles, SSO, audit, retention policy and compliance work — only if customers require them.
5. **Deferred guardrail:** the architecture and policy guardrail (Pillar 7). Do not start it until the evidence product has paying validation and the owner chooses a team buyer and cloud/self-hosted shape.

## Open decisions

These are not settled by this document. The owner decides them explicitly.

| Decision | Options | Why it matters |
| --- | --- | --- |
| Architecture | Local-first remote fetch vs hosted cloud sync | Privacy posture, compliance burden, collaboration |
| First two harnesses | Claude Code + OpenCode, or Claude Code + Codex | Adapter effort and initial market |
| Narrative generation | Deterministic only vs optional model summary | Trust, cost, privacy |
| First paid segment | Individual developers vs teams vs regulated organizations | Accounts, licensing, sales and feature priority |
| Launch platforms | Linux-only pilot vs Linux + macOS | Paying-developer expectations |
| Pricing model | Subscription vs one-time license vs open-core | Distribution and support economics |
| Diagram source of truth | Native scene schema vs external format | Provenance, export and rendering quality |
| Guardrail timing and shape | Defer until paid evidence validation vs build as the primary team product | Focus, buyer, cloud/compliance burden and competitive risk |

## What this vision is not

- It is not a claim that cloud repositories, multiple harnesses, subagent tracking, cost attribution, plugin/skill capture or the new diagrams exist today.
- It is not a general LLM observability/APM platform, a code host, an autonomous agent, a correctness scorer or a hidden-reasoning extractor.
- It is not permission to upload session evidence, prompts or code to a Quoli service.
- It is not permission to call an estimate a bill, a derived grouping a fact, or a successful command a verified feature.
- It is not a commitment to ship the deferred architecture guardrail in the initial paid product.
