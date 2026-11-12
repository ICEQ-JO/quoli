# Product redesign: from MVP to product

Status: **in progress**. Owner direction 2026-11-12: everything works, but the UI and UX feel like an MVP. Make it a product in the spirit of Linear. Roadmap phase: **1 — MVP** (the "polish" outcome), continued.

Each piece is a GitHub issue and its own PR, built in order. Every piece keeps `pnpm demo`, `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build` passing and is checked in a browser at 1280 px and 1600 px in both themes.

## What the owner found confusing

| Area | Problem |
| --- | --- |
| Navigation | A narrow icon rail; no Dashboard or Usage. It feels like an MVP. |
| Git | Unclear whether it shows Git or GitHub; `fix/x` and `origin/fix/x` appear as separate tags; no legend. |
| Replay bar | "Step 3 / 48" and a token line with no explanation. |
| Code | Folder boxes with no connections; clicking only drills deeper. It doesn't show what changed or the code. |
| Infra | "PR baseline" (a CI workflow) drawn like a running service. Unclear whether hosted providers (AWS, Vercel, Supabase…) will appear. |
| Agents | Tool calls are cut off and the rows are hard to read. |

## Decisions (owner, 2026-11-12)

- Navigation: a Linear-style labelled sidebar. Dashboard, Sessions and Usage; projects listed underneath; Settings at the bottom.
- Code lens: a **change map** first (changed files at the centre, real import edges 1–2 hops out, code and diff side by side). Function-level detail follows as roadmap Phase 2.
- Replay bar: stays visible, redesigned with plain labels.
- Usage page: spend over time, breakdowns (model, project, session), cache efficiency, and local budgets.
- Open: which hosted provider to connect first (roadmap Phase 4).

## Pieces

| # | Piece | Issue | Status |
| --- | --- | --- | --- |
| R1 | Visual system, sidebar, Dashboard, Usage, Settings sections, session layout, replay bar | #100 | PR open |
| R2 | Agents lens: conversation-style rows, full commands, inline detail, filters | #101 | PR open |
| R3 | Code lens: change map with code and diff | #102 | PR open |
| R4 | Git lens: local vs remote clarity, legend, session tags, commit detail | #103 | |
| R5 | Infra lens: services vs pipelines, honest Connections section | #104 | |
| R6 | Final pass: motion, empty states, both themes, accessibility, large-demo check | #105 | |
