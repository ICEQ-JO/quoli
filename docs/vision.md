# Quoli — product vision

> **One map of everything your coding agents did — and everything it touched.**

## The problem

Developers now ship code they did not write, reviewed only partly, into systems they do not fully understand. The agent ran 200 tool calls, spent a million tokens, spawned three subagents, edited 14 files on a branch, and that code deploys to two services. Today that story is scattered across a terminal scrollback, a git diff, a cloud console and a billing page. Nobody sees it whole.

Existing tools each see one slice:

| Tool | Sees | Misses |
| --- | --- | --- |
| Agent tracing (LangSmith-style) | prompts, tool calls, tokens | the codebase and where the work landed |
| Code maps (Sourcegraph, CodeSee) | structure of the code | who changed it and why |
| Git clients | branches, commits, diffs | the agent's reasoning trail and cost |
| Railway / cloud consoles | services and metrics | which change, by which agent, reached them |

## The thesis

The valuable thing is **not any single slice — it is the thread between them**:

```text
prompt → agent → tool calls → files changed → where they sit in the code
       → which branch / commit → which service runs that code → how it behaves
```

Quoli is built around that thread. Everything is drawn on **one board** with **one shared selection**: pick an agent session and it lights up in every view — the files it touched in the code map, the branch it worked on, the services those files deploy to.

## The language

Quoli's "new language" is a small, fixed visual vocabulary. Every view is composed only of these, so a developer learns it once.

**Things (nodes)**

| Node | Meaning | Look |
| --- | --- | --- |
| Session | one agent run, from first prompt to end | row in the sidebar, chip on the Git lens |
| Prompt | what the human asked | white card |
| Agent | the main agent or a subagent | a swimlane |
| Tool call | one action — read, edit, run, search, spawn, web/MCP | colored card |
| File / folder | the code | chip inside nested folder boxes |
| Branch / commit | version history | lane and dot |
| Service | something that runs: web app, API, worker, database, cache, queue, pipeline, third-party | card on the infra board |

**Relations (edges)**: `prompted`, `spawned`, `read`, `edited`, `imports`, `ran on branch`, `depends on`, `calls`, `deploys`.

**Colors carry meaning everywhere**: blue = read, orange = edited, teal = ran a command, yellow = searched, purple = subagent, pink = web/MCP, red = failed. An orange glow on a file, a service or a session always means "the agent changed this."

**Every fact has a basis**, and the UI shows it:

- *recorded* — reported by the agent (a hook event, a transcript line). Solid.
- *derived* — computed from recorded facts or the repository (an import edge, a compose dependency). Solid.
- *inferred* — a best guess from convention (a `stripe` dependency implies Stripe). **Dashed**, and labelled.

Quoli never invents what it cannot see: unknown values stay unknown, and it never claims a feature works because a command exited 0.

## The four lenses

One board, four ways to look at it. Number keys 1–4 switch; the selection and the timeline stay.

1. **Agents — what it did.** Swimlanes for the main agent and each subagent; tool calls in time order; prompts above; failures in red; token spend per lane.
2. **Code — where it happened.** The repository as nested folder boxes. Files the session read are outlined blue, files it edited glow orange; everything else dims. Select a file to see its import edges, the exact edits the agent requested, and the git diff.
3. **Git — which branch.** Branches as lanes, recent commits as dots, the uncommitted working tree, and the agent sessions that ran on each branch.
4. **Infra — where it runs.** An Excalidraw-like board of services read from the repo (compose, Dockerfiles, Vercel, Fly, Railway, Render, Cloudflare, Serverless, Terraform, GitHub Actions, dependencies). Services whose code the session changed glow orange. Live CPU/memory where Docker is running locally.

Across the bottom, a **timeline** replays the session step by step — every lens rewinds with it — with a cumulative token line.

## Who it is for

**First: the individual developer using Claude Code** who wants to answer, in under a minute, "what did the agent just do to my project, what did it cost, and what do I need to review?" Local, private, free to try.

**Later: the team lead** who wants the same view across several developers' agents — which requires the hosted version.

## Principles

- **Glanceable first, exact on demand.** The map tells the story in two seconds; the inspector shows the exact diff, input and output.
- **Local by default.** Evidence never leaves the machine unless the user explicitly turns on sync.
- **Honest.** Recorded vs inferred is always visible. Gaps are shown, not hidden.
- **Zero-config.** `pnpm connect <repo>` and start the agent. Infrastructure is read from files already in the repo.
- **Passive.** Quoli observes; it never blocks, slows or steers the agent.

## Roadmap

Each phase is something a developer can use on its own.

| Phase | Outcome | Status |
| --- | --- | --- |
| **0 — Foundation** | Claude Code hooks → local server; sessions, tool calls, tokens; four lenses; replay; demo | **Built** (proof of concept) |
| **1 — MVP** | App shell with Home, Projects, Sessions and Settings; session Summary with cost in dollars and a review checklist; lenses that stay readable on real repos; polish and light theme. See the [MVP plan](mvp.md) | **Built** |
| **2 — Deeper code** | Symbol-level code map (functions, routes, tables) for TS/Python | |
| **3 — More agents** | Codex, OpenCode and Pi adapters on the same event model; MCP/skill/plugin usage per session | |
| **4 — Live infra** | Provider connections (Vercel, Railway, Fly, AWS) for real deploys and metrics; link a deploy back to the commit and the session that produced it | |
| **5 — Hosted** | Opt-in sync to a hosted dashboard; teams; shared sessions and review links | |

## Non-goals (for now)

- Replacing an IDE, a code review tool or an APM product. Quoli links to them; it does not rebuild them.
- Capturing hidden model reasoning. Only what the agent emits.
- Controlling the agent (approvals, policy enforcement). Observation first.

## Open questions for the owner

1. **Pricing and audience** — free local tool with paid hosted teams, or paid from day one?
2. **Symbol-level map** — invest in a real call graph (compiler/tree-sitter, full-depth) or stay file-level with smarter grouping?
3. **Which second agent** matters most to you: Codex, OpenCode or Pi?
4. **Infra providers** — which one do you deploy to today? That decides Phase 3's first integration.
