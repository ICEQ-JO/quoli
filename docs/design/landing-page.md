# Quoli landing page

> Local implementation/validation reference. The [hosted product vision](../vision.md) supersedes local-only product scope; the landing describes the target product and labels what is still planned or unavailable.

Rebuilt for QUO-83 / D01 increment 2. The chosen direction is recorded in [directions/d01/README.md](directions/d01/README.md) as **D — The Evidence Field**. A, B and C were rejected.

## Purpose and copy boundary

The page explains the target product in one fold, then supports it with four ruled sections. It is not a capability announcement:

- The hero states the product definition: a cited record of what coding agents did, what changed, what it cost and what remains unverified.
- **The hosted dashboard, device pairing and OpenCode, Codex and Pi adapters are labelled planned** in the hero note, the harness rail and the footer.
- There are no metrics, testimonials, customer logos, certifications, prices or pilot CTA. The owner deferred the pilot CTA on 2026-10-23.
- The evidence artifact is synthetic. It is drawn from existing fixture content and never executes a command.

## Implemented structure

- **Header:** Quoli mark, four anchor pills (How it works, Evidence, Privacy, FAQ) and a solid **Open workspace** action. The nav hides below 900px; the footer repeats the anchors.
- **Hero:** badge, two-line headline `Every agent change, / accounted for.`, one citation sentence, **See the evidence** and **How it works** actions, a planned-feature note, and a three-beat pipeline row: local connector, chosen cloud upload, one workspace.
- **Evidence field:** an inline SVG constellation of `session`, `prompt`, `capability`, `turn`, `tool call`, `subagent`, `file`, `hunk`, `check`, `cost` and `gap` nodes. Every node is labelled `recorded`, `derived` or `inferred`; the inferred node uses a dashed ring and the gap edges are the only moving part.
- **How it works:** three ruled steps (Record, Derive, Share) and a harness rail naming Claude Code as the first verified adapter and OpenCode, Codex and Pi as planned.
- **Evidence:** the existing synthetic session review, restyled to the new system. It keeps the three accessible tabs (File changes, Recorded checks, Missing evidence), the captured diff, the reported-check limits and the local sample link.
- **Privacy:** a four-row ledger — Capture, Upload, Retain, Inspect — and a link to the privacy contract.
- **FAQ:** six native `<details>` answers covering upload, hidden reasoning, harness support, check semantics, deletion and hosted availability.
- **Footer:** section and resource links, the planned-feature note, synthetic-data statement and no-analytics statement.

## Visual system

Implementation: [landing-page.tsx](../../apps/web/app/components/landing/landing-page.tsx) and [landing.css](../../apps/web/app/components/landing/landing.css). The landing is scoped with `--q-*` properties and does not retheme the workspace.

| Token | Value |
| --- | --- |
| Background `--q-bg` | `#000000` |
| Text `--q-ink` | `#ffffff` |
| Supporting `--q-muted` | `#9a9a9a` |
| Metadata `--q-muted-2` | `#7e7e7e` |
| Rule | `rgba(255,255,255,0.14)` / `0.08` |
| Surface / raised | `#050505` / `#0b0b0b` |
| Addition | `#0e1a12` / `#b9d5b5` |
| Removal | `#1c1012` / `#e3adaf` |
| Unknown | `#e0c48d` |

Type is locally bundled **Inter Variable** with system fallbacks; **Instrument Serif italic** is used only for the emphasised phrase in the headline and section titles. No Google Fonts or remote font is requested. Body copy is 15.5px/1.6 in the hero and 14.5px/1.7 in sections. The headline is `clamp(38px, 4.4vw, 62px)`, weight 500, line-height 1.04, tracking −0.045em; section titles are `clamp(30px, 3.2vw, 46px)` at 1.08. Code uses SFMono-Regular / Consolas / Liberation Mono at 12px/1.85.

The page is dark-only. Liquid-metal pills carry the only decorative gradients; the solid action is a white-to-grey plane with a hover glow. Content is organised by hairlines and tonal planes, not cards. The evidence artifact is the only bordered panel. A fixed grain layer sits above the page at 4.5% opacity. The evidence field fades under a radial scrim so the copy stays readable.

## Responsive and interaction decisions

- Content caps at 1200px with 48px side margins; the header caps at the viewport with 40px padding.
- At 1100px margins become 40px and the section head tightens. At 900px the nav hides, the hero stays bottom-aligned, stats stack and centre, steps become one column and privacy/FAQ stack. At 760px the example becomes a single column with the context above the evidence and the margins become 20px. At 560px actions become full-width and code shrinks to 11.5px. At 360px margins become 14px.
- The hero is `min-height: calc(100svh - header)`. The page scrolls normally; there is no desktop `overflow: hidden` lock.
- Entrance motion is a staggered CSS reveal (mask, pop, rise, slide). Every animated element rests at its final state if animation is unavailable. `prefers-reduced-motion` removes all animation and transition, including the evidence-field drift and the serif blur.
- Focus is a 2px white outline with 3px offset. The skip link is the first tab stop. Tabs use roving tab stops, Arrow Left/Right, Home and End, with linked tab/panel semantics. FAQ rows are native disclosures.
- Header navigation is hidden below 900px rather than replaced with a modal menu; section anchors remain in the footer. This is a deliberate simplification of the supplied reference and avoids a focus trap for four same-page links.

## Validation

Recorded on 2026-10-23 for this increment:

- Landing browser suite: 8 passed, including the local sample link, tab keyboard behavior, FAQ disclosure, workspace link, no remote requests, and 320/390/768/1440 layouts under reduced motion.
- `pnpm typecheck`, `pnpm lint` and `pnpm build` passed.
- The no-remote-request check covers every request made by `/landing`; only loopback URLs are allowed.
- Screenshots inspected: [desktop](screenshots/quoli-landing-1440.png) and [mobile](screenshots/quoli-landing-390.png).

These results validate the tested flows and build, not complete accessibility, every browser, or cloud readiness.

## Limits

- The landing is a marketing surface for the target product, not evidence that hosted sync, OpenCode, Codex or Pi exist.
- The evidence artifact is illustrative: it does not execute checks, infer a full-suite run or establish edit authorship.
- The header's **Open workspace** action enters the local connection flow; there is no public sign-in or pilot application.
- Workspace theming, the remaining D01 increments and the visual-regression baseline belong to later work. This increment does not retheme the workspace.
