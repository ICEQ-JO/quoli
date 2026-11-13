# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Developers and engineering teams building with coding agents. Individuals need to
understand what changed, what it cost and what to review. Team owners need a view
of agent usage across members through opt-in session summaries. Detailed prompts,
source code, commands and tool output remain on each developer's machine.

Quoli is a proprietary product. Do not position it as an open-source, student,
academic or volunteer collaboration project.

## Product Purpose
Quoli is one visual map of what coding agents did. It joins the trail that today is scattered across terminal scrollback, git diffs, cloud consoles and billing pages: prompt → agent → tool calls → files changed → where they sit in the code → which branch/commit → which service runs that code. Success is a developer answering "what changed, what did it cost, what do I review?" without leaving Quoli.

## Positioning
Other tools see one slice: agent tracing sees prompts and tokens but not the codebase; code maps (Sourcegraph, CodeSee) see structure but not who changed it or why; Git clients see commits but not the agent's trail or cost; cloud consoles see services but not which change reached them. Quoli draws all four as lenses on one board with one shared selection, so picking a session lights up its files, its branch and the services those files deploy to.

## Operating Context
Runs locally: `pnpm dev`/`pnpm demo` serves the app on 127.0.0.1:4400. `pnpm connect <repo>` (or Projects → Connect) installs Claude Code hooks; events stream in live over SSE. Used beside a terminal running Claude Code and an editor. Sessions range from a 2-call question to 500+ tool calls with subagents; repositories range from tens to tens of thousands of files and thousands of commits.

## Capabilities and Constraints
- Agents: Claude Code, Codex, OpenCode and Pi locally.
- Teams: opt-in summary sharing and an account dashboard exist; detailed hosted session review is future work. See docs/teams.md.
- Code: file-level map with relative JS/TS import edges; symbol-level (functions, routes, tables) is roadmap Phase 2.
- Git: reads the local repository with `git` (branches, remote-tracking refs from the last fetch, commits). No GitHub API.
- Infra: detected from config files in the repo, plus live CPU/memory from local Docker. Hosted provider connections (Vercel, AWS, Supabase, …) and their metrics are roadmap Phase 4 and do not exist yet.
- Cost is an estimate from an editable list-price table, never an invoice.
- Terminology: session, prompt, agent/subagent, tool call, lens (Summary, Agents, Code, Git, Infra), project.

## Brand Commitments
Name: Quoli (formerly Traceframe). Owner direction 2026-11-12: the app must feel like a finished product in the spirit of Linear, not an MVP. Fixed color meanings: blue = read, orange = edited, teal = ran a command, yellow = searched, purple = subagent, pink = web/MCP, red = failed; an orange glow always means "the agent changed this".

## Evidence on Hand
Real local sessions recorded from Claude Code; the synthetic demo (`pnpm demo`, `pnpm demo --large`: ~2,400 files, 560+ commits). No users, testimonials, benchmarks or pricing exist; do not invent them.

## Product Principles
- Glanceable first, exact on demand: the map tells the story in two seconds; the code, diff, input and output are one click away.
- Honest: every fact is recorded, derived or inferred, and the UI shows which. Unknown stays unknown; a passing command never means a feature works.
- Local by default: nothing leaves the machine unless the user turns on sync.
- Passive: Quoli observes and never blocks or steers the agent.
- Zero-config: connect a repo and start the agent; infrastructure is read from files already in the repo.

## Accessibility & Inclusion
WCAG AA contrast in dark and light themes (enforced by `tests/theme-contrast.test.ts`), full keyboard operation, screen-reader labels on canvas nodes, no horizontal scroll at 1280 px.

## Landing page (marketing surface)

Mode: Persuade. Audience: developers using coding agents; primary action: Join the
waitlist, secondary action: explore real screenshots of the synthetic demo.

Owner-approved direction (2026-11-12, #159): preserve original pixel artwork and
playful motion, establish a baby-blue/ice/denim/midnight/cream identity, and give
Quoli its own composition and logo. The previous instruction to follow the reference site's
structure is superseded. Keep the working recorder; avoid rabbit/robot mascots,
game-world treatment, paired green panels and a green-to-blue chapter switch.

The landing mark is a stepped open Q with a connected square endpoint. One sky-field
hero pairs the promise and action with original pixel scenery. Product tabs sit to the left of
real synthetic-demo screenshots on desktop, with a compact mobile grid. The app's activity colors remain semantic and separate.

The current app supports Claude Code, Codex, OpenCode and Pi locally. Opt-in team summary sync is available today. Detailed hosted session review and
live provider capabilities must remain distinguished from shipped capabilities.
No customer testimonials, benchmarks or pricing may be invented. Demonstrations
must use synthetic data and never read private captured sessions.

The landing design system lives in `docs/landing-design.md`; `DESIGN.md` is the app.

## Owner content and artwork correction — 2026-11-12

Lead with review context, agent effort/spend and team visibility. The landing page
must not link to the private source repository or suggest an open-source project.
Use a square animated workspace with an outdoor view, and the requested rounded
contour-art footer and large mission link in the established blue identity. This
supersedes the previous flat footer and small mission-link direction.
