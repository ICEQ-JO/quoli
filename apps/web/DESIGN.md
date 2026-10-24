---
name: Quoli
description: The Evidence Field — a document-first workspace for inspecting available coding-agent evidence.
colors:
  bg: 'light-dark(#ffffff, #000000)'
  surface: 'light-dark(#f8f8f8, #080808)'
  sidebar: 'light-dark(#fafafa, #080808)'
  ink: 'light-dark(#191919, #f5f5f5)'
  muted: 'light-dark(#595959, #b5b5b5)'
  line: 'light-dark(#d7d7d7, #343434)'
  line-soft: 'light-dark(#e9e9e9, #242424)'
  accent: 'light-dark(#1b6094, #8bc8f5)'
  accent-dark: 'light-dark(#154c76, #b4dcfa)'
  selected: 'light-dark(#ebebeb, #202020)'
  hover: 'light-dark(#f0f0f0, #171717)'
  action: 'light-dark(#191919, #f5f5f5)'
  action-ink: 'light-dark(#ffffff, #111111)'
  action-hover: 'light-dark(#353535, #dcdcdc)'
  positive: 'light-dark(#216843, #87d1a6)'
  positive-bg: 'light-dark(#eff7f2, #12231a)'
  info-bg: 'light-dark(#eef5fb, #102332)'
  warning: 'light-dark(#805615, #e6bc73)'
  warning-bg: 'light-dark(#fff8ed, #281f12)'
  negative: 'light-dark(#a33d49, #efa2aa)'
  negative-bg: 'light-dark(#fff2f2, #2b1519)'
  q-bg: '#000000'
  q-ink: '#ffffff'
  q-muted: '#9a9a9a'
  q-muted-2: '#7e7e7e'
  q-line: 'rgba(255, 255, 255, 0.14)'
  q-line-soft: 'rgba(255, 255, 255, 0.08)'
  q-surface: '#050505'
  q-raised: '#0b0b0b'
  q-add: '#0e1a12'
  q-add-ink: '#b9d5b5'
  q-remove: '#1c1012'
  q-remove-ink: '#e3adaf'
  q-unknown: '#e0c48d'
typography:
  session-title:
    fontFamily: '"Instrument Serif", Georgia, serif'
    fontSize: 36px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.4px
  headline:
    fontFamily: '"Inter Variable", "Segoe UI", sans-serif'
    fontSize: 22px
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: -0.5px
  section-title:
    fontFamily: '"Inter Variable", "Segoe UI", sans-serif'
    fontSize: 15px
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: -0.2px
  request:
    fontFamily: '"Inter Variable", "Segoe UI", sans-serif'
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.7
  body:
    fontFamily: '"Inter Variable", "Segoe UI", sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: '"Inter Variable", "Segoe UI", sans-serif'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.55
  metadata:
    fontFamily: '"Inter Variable", "Segoe UI", sans-serif'
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.55
  source-code:
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.8
  landing-display:
    fontFamily: '"Inter Variable", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: clamp(38px, 4.4vw, 62px)
    fontWeight: 500
rounded:
  tag: 4px
  field: 5px
  control: 6px
  container: 7px
  dialog: 10px
spacing:
  icon-gap: 8px
  control-inline: 13px
  mobile-gutter: 16px
  workspace-block: 24px
  workspace-inline: 28px
  document-gap: 32px
components:
  button-default:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: 8px 13px
  button-primary:
    backgroundColor: '{colors.action}'
    textColor: '{colors.action-ink}'
    rounded: '{rounded.control}'
    padding: 8px 13px
  button-primary-hover:
    backgroundColor: '{colors.action-hover}'
    textColor: '{colors.action-ink}'
  button-subtle:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    rounded: '{rounded.control}'
  search-field:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: 0 10px
  navigation-selected:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: 8px 10px
  evidence-recorded:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.positive}'
    rounded: '{rounded.tag}'
    padding: 2px 6px
  evidence-derived:
    backgroundColor: '{colors.info-bg}'
    textColor: '{colors.accent}'
    rounded: '{rounded.tag}'
    padding: 2px 6px
  connection-container:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.container}'
---

# Design System: Quoli

## Overview

**Creative North Star: "The Evidence Field"**

The Evidence Field makes the captured request the entry point to review, then lets the reader inspect its retained sources. Black and white fields, fine neutral rules and compact controls keep dense evidence readable beside an editor. A restrained italic session title gives the document an identity without turning everyday controls into display typography.

This is a source-derived record of the workspace built for QUO-84, following owner-approved B, Document first, within D, Evidence Field. The approved mock establishes composition, not facts or implemented controls. The hidden design contract in `app/layout.tsx`, effective declarations in `app/globals.css` and delivered component markup govern this record. Earlier charcoal/fern and Geist workspace descriptions are superseded. `/landing` retains its independently scoped presentation. This document does not certify browser checks or finish-review results.

**Key Characteristics:**
- Neutral navigation and selection; color reserved for evidence roles and interaction cues.
- Readable ruled documents with contextual source inspection.
- Local fonts, outlined SVG icons, native controls and explicit uncertainty.
- Responsive work lists and a native evidence dialog on narrower screens.

## Colors

The workspace uses achromatic fields and rules with restrained semantic blue, green, amber and red. Frontmatter preserves the actual `light-dark(light, dark)` assignments; dark is the initial root theme and the theme control selects light or dark through `data-theme`.

### Primary

- **Action ink / action field** (`action`, `action-ink`, `action-hover`): near-white primary action in dark mode and dark primary action in light mode. Selected navigation remains neutral.
- **Evidence blue** (`accent`, `accent-dark`, `info-bg`): source links, derived evidence, focus indicators and select interaction cues. It is not a large branded surface fill.

### Secondary

- **Observed green** (`positive`, `positive-bg`): recorded evidence, capture dots, recorded pass and added lines; exact meaning remains explicit in text.
- **Uncertainty amber** (`warning`, `warning-bg`): capture gaps, inferred relationships and incomplete results.
- **Failure rose** (`negative`, `negative-bg`): failures, destructive controls and deleted lines.

### Neutral

- **Page field** (`bg`), **secondary field** (`surface`) and **navigation field** (`sidebar`) establish planes.
- **Reading ink** (`ink`) and **supporting ink** (`muted`; `subtle` aliases it in CSS) establish hierarchy without hiding uncertainty.
- **Structural rule** (`line`), **quiet rule** (`line-soft`), **neutral selection** (`selected`) and **neutral hover** (`hover`) organize evidence without a tinted card grid.

**The Evidence Color Rule.** Use semantic color with a literal evidence label or status; color alone never establishes provenance or correctness.

### Scoped landing palette

`/landing` is fixed dark under `.landing-root`; it owns `--q-*` rather than inheriting workspace theme roles. Frontmatter’s `q-*` entries record its black field, white ink, two muted text levels, translucent rules, secondary/raised fields, addition/removal pairs and unknown amber. Keep its synthetic three-tab example visibly illustrative. Do not reinterpret its decorative evidence-field nodes as available live features.

## Typography

**Display Font:** locally bundled Instrument Serif, Georgia fallback; italic face imported in `app/layout.tsx`.
**Body Font:** locally bundled Inter Variable, Segoe UI and sans-serif fallbacks.
**Label/Mono Font:** Inter for labels; SFMono-Regular, Consolas, Liberation Mono, monospace for code, IDs and commands.

### Hierarchy

- **Session title:** frontmatter `session-title`, italic and balanced; narrows to (21px) at widths through (799px).
- **Page headline:** `headline` for Sessions; Overview uses (25px), Settings (22px). These remain Inter.
- **Section title:** `section-title`; review section headings step down to (14px) through (799px).
- **Request:** `request`, preserved whitespace and wrapping, bounded to (72ch); (16px) through (799px).
- **Body:** `body`; supporting document prose uses (13px), line-height (1.8), up to (75ch).
- **Controls and labels:** buttons (13px), navigation (14px desktop), labels (12px), retained-source metadata (11px). Tiny source/status labels are local exceptions, not the default reading size.
- **Source:** `source-code`; diff line numbers (11px), code cells (12px), tabular numbers in usage and properties.
- **Landing:** `landing-display` with Instrument Serif italic emphasis in hero and section headings; body (15px / 1.6). Landing has its own responsive headline clamps and font stacks in `landing.css`.

**The Title Rule.** In the workspace, reserve Instrument Serif italic for the session heading. Keep controls, prose and facts in Inter or source monospace.

## Layout

Desktop uses a fixed global sidebar (196px), a compact toolbar (52px minimum) and a remaining document field. Main workspace gutters are (24px vertical / 28px horizontal); home and workbench cap at (1640px), with the review cap (1600px) from viewport width (1600px). Sessions, Needs review, Settings and Project overview are global destinations. Review, Activity, Changes, Map, Usage and Coverage are session-local tabs. There is no persistent neighboring-session list in session review.

Review uses a flexible document and sticky properties plane (260px), gap (32px). Selecting evidence replaces properties with a source inspector (300px), gap (28px), separated by a vertical rule. Activity has a separate, wider contextual inspector (360–420px); do not impose the review width on all evidence surfaces. Review sections are ruled with (22px top / 28px bottom) spacing. Source payloads wrap; bounded diff panes scroll independently.

**The Context Rule.** Keep the review document primary. Opening a source replaces the properties plane with contextual evidence rather than adding a neighboring-session rail.

### Responsive behavior

- Through (1099px): ordinary review properties narrow to (210px), gap (26px); selected review/Activity inspection becomes one column and source detail opens in the native modal dialog. The source dialog is not a CSS-only drawer.
- Through (900px): Settings section navigation moves above its content and wraps.
- Through (899px): the review queue switches between its list and selected detail with a Back action; desktop auto-selection starts at (900px).
- Through (799px): global navigation becomes a fixed horizontal bar (56px), workspace loses its sidebar offset, toolbar is at least (48px), document gutters become (20px / 16px). Project context and properties hide, review status returns above the tabs, the session table hides supporting columns and adds textual status inside the session cell. Search occupies a full row; local tabs scroll horizontally. Overview and Settings remain available as icon controls.
- Through (559px): smaller control spacing and stacked evidence/usage layouts apply. Through (359px), Needs review becomes icon-only to preserve navigation width; accessible names remain in markup.
- Landing has its own breakpoints (1100px, 900px, 760px, 560px, 360px), plus a short desktop viewport rule (minimum width 901px / maximum height 780px). Its centered shell is capped at (1200px) with (96px) total desktop inset; header height steps from (72px) to (64px) through (900px).

These are effective source behaviors, not generic device categories. Earlier selectors remain in `globals.css`; later workspace overrides take precedence. The sidecar’s synthesized tonal ramps are panel previews, not additional shipped theme tokens.

## Elevation & Depth

The workspace is flat at rest: contrast, single-pixel rules and restrained secondary fields organize the document. Primary buttons have no shadow. Elevation remains for transient layers, including the display-options popover (`0 8px 24px #00000024`), native dialog (`0 24px 70px #00000033`) and its backdrop (`#00000080`). Legacy and specialized selectors contain other shadows; they do not define a new card elevation scale.

Landing retains its own decorative grain, evidence-field illustration, button sheen and hover glows. These are scoped marketing treatments, not workspace decoration.

Motion is functional and brief: shared controls transition background and border (160ms ease-out); review arrival is a small clip reveal (180ms, `cubic-bezier(0.16, 1, 0.3, 1)`) only under `prefers-reduced-motion: no-preference`. Workspace reduced-motion rules remove animation and transition duration and restore automatic scrolling. Landing’s separate reduced-motion rule removes animation/transition and restores fully visible static content. Do not apply the landing’s continuous decorative motion to review.

## Shapes

Controls use gently eased rectangular corners (`control`); selects and icon controls use `field`; provenance badges use `tag`; bounded Activity/connection containers use `container`. The native dialog is more rounded (`dialog`). Review sections and the review inspector seam stay square and ruled. One-pixel borders are the structural default. Small circular capture dots and map markers communicate status alongside text. Existing pill and specialized radii are local component details, not reasons to round every document section.

## Components

### Buttons and fields

Quiet outlined controls. Default buttons use surface and rule; primary uses action ink/field; subtle is transparent until hover. Shared padding is frontmatter `button-default`; minimum height (32px), with actual padding and line-height allowed to make it taller. Primary hover uses `action-hover`; subtle hover uses `line-soft`. Disabled buttons have (0.5) opacity and default cursor. Danger actions use failure rose border/text rather than a new filled brand button.

Search is a ruled rounded field with an unbordered input; focus-within changes its border to evidence blue. Native selects and checkboxes retain their semantics. Shared focus-visible on buttons, links, selects, inputs, summary and main uses a (2px) evidence-blue outline with (3px) offset; search uses its enclosing field’s focus treatment instead of an inner input outline. The skip link becomes visible on focus.

### Navigation and work lists

Neutral selected global navigation, quieter inactive text, surface hover. Active destinations expose `aria-current`. Local tabs use `aria-selected`, linked tab panels and keyboard navigation; active tabs receive an underline. Session groups are ruled tables with search, capture filter and disclosure-based display/order controls. Hover/focus reveals a row arrow; narrow layouts preserve session labels and textual capture status rather than relying on hidden columns. Page controls and totals describe the selected retained-session page.

### Review document and evidence inspector

A captured request anchors the document, followed by retained work, changed files, checks and capture limitations. Repository-only sessions use a repository document and properties variant. Unknown or unavailable review has an explicit explanation and recovery actions. Properties expose source facts and reported usage; they are replaced, not duplicated, when inspecting a source.

The inspector shows recorded observation, source/provenance, policy, payload, related records and copy-evidence-link feedback. Recorded/Derived badges combine text with green/blue roles; inferred relationships use an explicit label. It has loading and empty/unavailable states. Through (1099px), the same inspector renders in a labeled native `dialog` using `showModal()`, a visible Close button and Escape cancellation; the page locks scrolling while open. Desktop review keeps a simple vertical seam; Activity uses a bounded inspector plane.

### Delivered surface inventory

| Surface | Built presentation and states |
| --- | --- |
| Sessions | Grouped searchable work table; capture filter, display disclosure, order/group controls, retained-page navigation; loading, unavailable and no-match/no-session states. Empty collection opens the connection guide. |
| Review | Ruled request/work/files/checks document; properties or contextual source; repository-only variant, unknown result, capture warning, loading and failed/unavailable recovery. A recorded pass retains its correctness caveat. |
| Activity | Search, kind filters, source/receipt ordering, retained rows, neutral selection, Load more/end-of-history, source inspector; loading, fetch error and empty match states. |
| Changes | Capture selectors, bounded file list, search/type filter, unified/split comparison controls, signed add/delete lines, before/after availability, source links and pagination; loading, errors, absent text/binary/unavailable comparisons remain explicit. |
| Map | Bounded scrollable node field plus inspectable textual lists; solid/dashed relationships with explicit status and evidence links; loading/error/empty handling. It is derived retained evidence, not proof of causality or full architecture coverage. |
| Usage | Reported category table, input composition only when usable, derived cache-read share and retained source rows; missing values stay — or Unknown, incomplete counts retain caveats. No exact file/prompt cost allocation is implied. |
| Coverage | Ruled source/capture rows, capture-policy limitations and synthetic/repository/source distinctions; unavailable metadata stays unknown. It does not certify a live connection. |
| Needs review | Capture-gap inbox with selected source detail, neutral selection and amber warnings, retry, load-more and empty/loading/failure states; narrow layouts have list/detail navigation. Scope is the current page of sessions. |
| Project overview | Retained-page ledger, session register, gap queue and connection guide; unavailable counts stay —, failed summaries expose retry, empty state explains the next step. |
| Settings | Section navigation, capture policy checkboxes, pause/resume, explicit retention apply/confirmation, storage facts and confirmed deletion; busy/disabled, saved/error feedback, last confirmed settings and deleted-state outcome. Immediate policy actions remain separate from destructive confirmations. |
| Connect | Native details disclosure, source/installed CLI select, off-by-default code-consent checkbox, horizontally scrollable command, copy success/failure recovery. It is inert guidance; commands run only in the user’s terminal. |
| Landing | Scoped fixed-dark marketing page, decorative field, three-tab synthetic example, setup/privacy sections, native FAQ disclosures and working workspace links. Illustrative content never becomes live evidence. |

### Shared recovery and interaction states

Loading is expressed through status text and Activity skeletons, not fabricated data. Failures use an alert with a retry or useful destination; empty and filtered-empty states explain their context. Copy actions announce success or manual-copy recovery. Busy actions disable appropriately; focus remains visible and tool links remain inspectable. Preserve reduced-motion paths, long-text wrapping, horizontal code scrolling and explicit unknown labels across new screens.

This inventory describes delivered source, not all vision features. Hosted accounts/sync, fabricated command palettes, new-session creation and command replay in the approved mock are not established by this redesign. Additional source adapters, scene/cost work and commercial readiness must be tracked against their own delivered implementation records.

## Do's and Don'ts

### Do:

- **Do** preserve source links, captured text boundaries and recorded / derived / inferred / unknown distinctions.
- **Do** use the shared semantic variables so both workspace themes retain their assignments.
- **Do** keep request prose readable, code scrollable and narrow-screen status available in text.
- **Do** preserve native dialog, keyboard tabs, skip link, disabled feedback and reduced-motion behavior.
- **Do** keep the landing’s scoped tokens and presentation distinct from workspace controls.

### Don't:

- **Don't** restore the superseded fern workspace identity or Geist UI font.
- **Don't** turn unavailable evidence or reported usage into zero, a correctness verdict or fabricated content.
- **Don't** copy mock-only search, Run check/replay, workflow state or new-session controls into the product.
- **Don't** promote a static mock or this source extraction into proof that browser checks or independent review passed.
