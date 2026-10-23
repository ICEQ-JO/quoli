# Quoli landing page

Implemented for [#51](https://github.com/ICEQ-JO/quoli/issues/51) on `feat/quoli-product-experience`. This records the landing surface only. The [whole-product experience rebuild](../work/product-experience.md) still has workspace, investigation, lifecycle and cross-product work pending.

## Purpose and rationale

The page introduces a local evidence workspace through the work a developer will review: a captured change, a reported check and an explicit unknown. Its “precise evidence desk” direction uses a broad review example, locally bundled Geist, neutral charcoal/white planes and restrained fern green. The headline is “Your agent moved fast. See what changed.” The product itself supplies the visual explanation.

The former mechanical recorder, confidence dial, AST claims, invented performance figures and installer command are replaced. The example makes no authorship, completeness or correctness verdict. Repository history is agent-independent; detailed live activity is an optional Claude Code connection.

## Implemented structure and actions

- Sticky header: Quoli brand, Explore / How it works / Get started anchors, theme control and **Open workspace** at `/`.
- Hero: local setup action, example anchor and local/no-account context.
- Synthetic session: developer request and source/capture/repository properties beside **File changes**, **Recorded checks** and **Missing evidence** tabs. The first tab shows a bounded illustrative cache diff; the second shows exit code 0, three reported passing tests and zero reported failing tests; the third says a full-suite run is not established. Every tab explains the evidence limit. A link opens `/?project=demo-quoli&session=session-cache&view=session`.
- Capabilities: repository history, available Claude Code activity/checks and visible unknowns, each linked to repository documentation.
- Privacy: local storage, explicit code/untracked consent, redaction before persistence, separate activity connection and bounded observation.
- Setup: clone the source, run `pnpm install --frozen-lockfile` then `pnpm demo`, open `http://127.0.0.1:3140`, and optionally connect a repository. The shown `--capture-code` option is explicitly opt-in; omitting it gives metadata only. Untracked files require separate consent. Node 24.16+ within Node 24, pnpm 11.12 and Git are named. Linux release guidance links to the CLI docs; package distribution is unpublished.
- Footer: source, documentation and workspace actions.

Commands are display/copy content. The landing page never executes them or collects real session evidence.

## Visual system

Implementation: [landing-page.tsx](../../apps/web/app/components/landing/landing-page.tsx) and [landing.css](../../apps/web/app/components/landing/landing.css). The [application design reference](../../apps/web/DESIGN.md) preserves the existing workspace system and documents this landing's separate scope.

| Token | Dark | Light |
| --- | --- | --- |
| Background `--q-bg` | `#141717` | `#f9faf8` |
| Surface `--q-surface` | `#1b1f1e` | `#ffffff` |
| Raised `--q-raised` | `#222725` | `#eef2ed` |
| Text `--q-ink` | `#f0f3f1` | `#202a24` |
| Supporting text `--q-muted` | `#a8b2ac` | `#59655d` |
| Rule `--q-line` | `#343e38` | `#d6ded6` |
| Accent `--q-accent` | `#b9d5b5` | `#355b3c` |
| Button / text | `#c6e1c1` / `#172b1c` | `#2f5138` / `#ffffff` |
| Addition / removal | `#243b2d` / `#382b2c` | `#e6f1e6` / `#f8eaea` |
| Negative / unknown | `#e3adaf` / `#dec49b` | `#95434d` / `#805b24` |

Body text is Geist Variable at 15px/1.6. Desktop display type is `clamp(42px, 4.4vw, 64px)`, weight 520, line-height 1.09 and tracking −0.038em. Section headings use `clamp(30px, 3vw, 42px)`, weight 500, line-height 1.2. Code uses SFMono-Regular / Consolas / Liberation Mono at 12px/1.9. Small supporting metadata is intentionally subordinate; it is not the scale for primary reading content.

Fine rules and tonal planes organize the page. The example alone has a soft `0 24px 60px #00000018` shadow and 9px corners; code uses 5px corners and controls 6px. A simple circle carries the local-address privacy illustration. Diff signs, line numbers and literal status text preserve meaning beyond color.

## Responsive and interaction decisions

Content is capped at 1180px with 48px desktop side margins; the header caps at 1360px with 32px side margins. Hero copy and setup use two columns, the example has a 31% context rail, and capabilities use three ruled columns.

At 1100px and below, content margins become 32px, hero copy stacks, its title is 60px, and example context takes 34%. At 760px and below, margins become 20px, the header is 64px high, anchor navigation hides, and theme/workspace actions remain. Display type becomes `clamp(35px, 7.8vw, 54px)`. The example, capabilities, privacy and setup stack; example properties use three columns. Code scrolls inside its own bounded panel. At 360px and below, margins become 14px and header/tab spacing tightens. The footer wraps into a vertical layout on mobile.

Tabs use selected state, roving tab stops, linked tab/panel semantics and Arrow Left/Right, Home and End keys. The panel remains keyboard reachable. A skip link targets the main content; focus has a 2px accent outline with 5px offset. Anchor targets retain 94px sticky-header clearance.

Theme defaults to dark, reads and writes the existing local `traceframe-theme` key, and updates both landing and document theme attributes. This historical key preserves existing preference compatibility. Storage failures are tolerated. The theme button announces the next theme.

Copy writes only the two demo commands. Success changes the button to **Copied**; failure shows manual-copy guidance in a status region; both reset after four seconds. Pending timers are cleared on unmount. Clipboard access remains subject to browser permissions. The example has a 500ms clipping/8px reveal only when reduced motion is not requested; button background transitions use 160ms ease-out.

## Validation and limits

Integration verification reported for this increment on 2026-10-22: eight landing browser tests passed, typecheck passed, production build passed, and unit tests passed with 120 passing / four skipped. Lint passes with three existing warnings in analysis/pilot code. These results validate the tested flows and build, not product correctness, complete accessibility or all browser/runtime environments.

Rendered screenshots inspected for this reference:

- [Dark desktop](screenshots/quoli-landing-dark.png)
- [Light desktop](screenshots/quoli-landing-light.png)
- [Mobile](screenshots/quoli-landing-mobile.png)

The example is illustrative rather than a live embedded workspace. It does not execute checks, generate measurements, infer a full suite run, or establish edit authorship. Missing records do not prove events never happened. Capture remains bounded and unsupported values remain unknown. Distribution is unpublished; the fresh-machine pilot is still the owner's check. The workspace's broader redesign remains pending.
