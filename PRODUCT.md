# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Individual developers using coding agents, and engineering teams/leads seeking to understand and review agents' changes. The intended audience includes users of multiple agents; the delivered integration currently supports Claude Code.

## Product Purpose
One visual map of coding-agent activity and everything it touched: activity, code, Git, and infrastructure as four connected lenses. Answer what happened, where, what it cost, and what needs review.

## Positioning
A shared selection connects recorded activity to affected files, repository history, and declared services. Append-only evidence is primary; derived and inferred facts are distinguished.

## Operating Context
Local Node/React application. Claude Code hooks and incremental transcript reads feed a local SQLite store. Synthetic demo runs without paid APIs.

## Capabilities and Constraints
Current: local capture, four lenses, replay, estimated usage costs, derived review checklist. Planned: other coding-agent adapters, provider connections, opt-in hosted synchronization and teams. Infrastructure relationships are repo-derived, not proof of a deployment. Never claim complete capture or correctness from a passing command.

## Brand Commitments
Quoli. Owner requests a complete landing-page replacement inspired by the reference site's full pixel-art theme: scenery, characters, typography and motion. Original Quoli art and storytelling. On 2026-11-12 the owner delegated creative decisions and implementation. Main conversion is Join the waitlist; no pricing, testimonials or availability claims may be invented.

## Evidence on Hand
`docs/vision.md`, `docs/mvp.md`, `docs/architecture.md`; synthetic sessions in `server/demo.ts`. No approved customer testimonials, usage benchmarks, or waitlist provider supplied.

## Product Principles
- Local by default; cloud only through explicit opt-in.
- Glanceable first, precise evidence on demand.
- Observe passively; never replay captured commands.
- Label unknowns, derivations and synthetic demonstrations honestly.
