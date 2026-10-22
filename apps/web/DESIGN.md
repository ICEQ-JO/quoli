---
name: Quoli
description: A session-first local evidence workspace with readable review documents and source-linked triage.
colors:
  bg: 'light-dark(#ffffff, #171719)'
  surface: 'light-dark(#ffffff, #1c1c1f)'
  sidebar: 'light-dark(#f6f6f7, #111113)'
  ink: 'light-dark(#242428, #ededf0)'
  muted: 'light-dark(#62626c, #aaaab5)'
  subtle: 'light-dark(#6b6b76, #a1a1ad)'
  line: 'light-dark(#e7e7eb, #323237)'
  line-soft: 'light-dark(#ededf0, #2a2a2f)'
  accent: 'light-dark(#6653c2, #b1a5ff)'
  accent-dark: 'light-dark(#5745b0, #c5bcff)'
  selected: 'light-dark(#f0edf9, #2b273a)'
  warning: 'light-dark(#855a18, #dfbd7d)'
  warning-bg: 'light-dark(#fff8ed, #2c271f)'
  negative: 'light-dark(#a33d49, #efa2aa)'
  negative-bg: 'light-dark(#fff2f2, #302124)'
  primary-fill: 'light-dark(#6653c2, #7360ce)'
  primary-border: 'light-dark(#6653c2, #8c79e2)'
  primary-hover: 'light-dark(#5745b0, #6752bd)'
  primary-text: '#ffffff'
  nav-selected: 'light-dark(#e9e8ed, #29292e)'
  nav-hover: 'light-dark(#ebebef, #202023)'
  recorded: 'light-dark(#57547d, #c2baf2)'
  derived: 'light-dark(#67529d, #c9b5ed)'
  derived-bg: 'light-dark(#f3eff9, #2a2533)'
  capture-end: 'light-dark(#387859, #8bc5a3)'
  diff-add-bg: 'light-dark(#eff7f2, #202e26)'
  diff-delete-bg: 'light-dark(#fff2f2, #332326)'
  diff-add-number: 'light-dark(#386b50, #9acdaf)'
  diff-add-gutter: 'light-dark(#e4f0e9, #25372c)'
  diff-delete-gutter: 'light-dark(#f9e6e8, #40282c)'
typography:
  headline:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: 22px
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: -0.5px
  session-title:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: 24px
    fontWeight: 560
    lineHeight: 1.3
    letterSpacing: -0.6px
  section-title:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: 15px
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: -0.2px
  request:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.8
  body:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
  row-title:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: 13px
    fontWeight: 450
    lineHeight: 1.55
  label:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.55
  metadata:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.55
  source-code:
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.8
  diff-line-number:
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.85
rounded:
  badge: 3px
  chip: 4px
  code: 5px
  control: 6px
  panel: 7px
  dialog: 10px
  sheet: 12px 12px 0 0
spacing:
  small: 8px
  control-gap: 10px
  inset: 12px
  section-inset: 16px
  inset-wide: 20px
  page-block: 24px
  page-inline: 28px
  document-rail-gap: 52px
components:
  button-primary:
    backgroundColor: '{colors.primary-fill}'
    textColor: '{colors.primary-text}'
    rounded: '{rounded.control}'
    padding: 8px 13px
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: 8px 13px
  nav-selected:
    backgroundColor: '{colors.nav-selected}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: 8px 10px
  search-field:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: 0 10px
  work-session:
    textColor: '{colors.ink}'
    typography: '{typography.row-title}'
    padding: 12px
  queue-selected:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.ink}'
    padding: 18px 15px
  recorded-basis:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.recorded}'
    rounded: '{rounded.chip}'
    padding: 2px 6px
  derived-basis:
    backgroundColor: '{colors.derived-bg}'
    textColor: '{colors.derived}'
    rounded: '{rounded.chip}'
    padding: 2px 6px
  captured-diff:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.panel}'
    typography: '{typography.source-code}'
---

# Design System: Quoli

## Overview

**Creative North Star: "The session workbench"**

Quoli starts with sessions, opens a readable document, and reveals exact source evidence when requested. A grouped work list, a document with properties, and a split review queue serve different tasks. Compact neutral chrome and restrained violet selection support that hierarchy; a palette change alone does not define the workflow.

The landing now follows a precise evidence desk with a broad synthetic review example and fern-green interaction. Its current implementation is scoped separately below. A full workspace redesign remains pending in the [whole-product experience rebuild](../../docs/work/product-experience.md).

The workspace sections record the shipped founder-approved direction in `../../docs/design/session-workspace.md`, informed by `../../docs/design/product-ui-research.md`. It supersedes the spacious municipal dashboard and the earlier compact restyle as design authority. The root layout's `founder-compact-workbench` contract describes this session-first implementation. This is a revisable scan of built CSS/components and dark, light, and mobile screenshots, not a new visual proposal.

**Key Characteristics:**
- Sessions first; global destinations stay stable.
- Readable requests and recorded work precede raw source detail.
- Neutral dark/light surfaces, local Geist, restrained violet emphasis.
- Explicit source, uncertainty, capture state, and unavailable-data language.

## Colors

### Landing-specific tokens

The `/landing` surface uses scoped `--q-*` properties from `app/components/landing/landing.css`; it does not replace the workspace palette below. Dark is the default and light is an explicit override. These pairs are dark / light: `bg` #141717 / #f9faf8, `surface` #1b1f1e / #ffffff, `raised` #222725 / #eef2ed, `ink` #f0f3f1 / #202a24, `muted` #a8b2ac / #59655d, `line` #343e38 / #d6ded6, `accent` #b9d5b5 / #355b3c, `button` #c6e1c1 / #2f5138, `button-ink` #172b1c / #ffffff, `add` #243b2d / #e6f1e6, `remove` #382b2c / #f8eaea, `negative` #e3adaf / #95434d and `warning` #dec49b / #805b24. Fern green identifies actions and selected evidence; literal labels and diff signs carry meaning alongside color. CSS is the source of truth for these scoped tokens; frontmatter above describes the incumbent workspace.

### Workspace palette

Frontmatter preserves the shipped `light-dark(light, dark)` values. Dark is the default; the root `data-theme` attribute sets `color-scheme` so the theme control changes actual paint. Theme is persisted locally. Keep paired values together rather than treating one theme as the token source.

### Primary
- **Restrained Violet** (`accent`, `accent-dark`): links, active session tabs, focus, and source actions. Primary filled buttons have distinct `primary-fill`, `primary-border`, and `primary-hover` values with white text; the pale dark-theme link accent is not their fill.
- **Selection Wash** (`selected`): selected evidence and queue items, plus recorded-basis backgrounds. Primary navigation selection is neutral (`nav-selected`), with a neutral hover (`nav-hover`).

### Secondary
- **Recorded / Derived** (`recorded`, `derived`, `derived-bg`): explicit provenance badges. Derived links and snapshot comparisons retain their basis wording.

### Tertiary
- **Capture Amber** (`warning`, `warning-bg`): gaps, uncertainty, inferred-basis notices, and missing end events.
- **Reported Failure** (`negative`, `negative-bg`): source-reported failure and error notices.
- **Recorded End** (`capture-end`): a source-reported session boundary, accompanied by text. It is not a task-success color.
- **Diff states** (`diff-add-bg`, `diff-delete-bg`, `diff-add-number`, `diff-add-gutter`, `diff-delete-gutter`): subtle added/deleted code rows and stronger numbered gutters. Deletion numbers use `negative`; signs and before/after numbers preserve meaning without color.

### Neutral
- **Workspace / Surface / Sidebar** (`bg`, `surface`, `sidebar`): charcoal planes in dark mode and white/off-white in light mode.
- **Reading / Supporting text** (`ink`, `muted`, `subtle`): content, explanations, and metadata.
- **Rules** (`line`, `line-soft`): shell divisions, document sections, grouped tables, and row separators.

**The Evidence State Rule.** Pair state colors with wording, icons, signs, or numbers. An end event, command exit code, or explicit-ID relationship does not establish feature correctness or authorship.

## Typography

### Landing type

The landing uses locally bundled Geist Variable with sans-serif fallback, body 15px/1.6. Display type is `clamp(42px, 4.4vw, 64px)`, weight 520, line-height 1.09, tracking −0.038em; section headings are `clamp(30px, 3vw, 42px)`, weight 500, line-height 1.2 and tracking −0.03em. Hero supporting text is 16px/1.75, capability reading text 14px/1.85, and example metadata 10–12px. Code uses SFMono-Regular, Consolas, Liberation Mono and monospace at 12px/1.9. At 1100px the hero title is 60px; at 760px it becomes `clamp(35px, 7.8vw, 54px)` and supporting text 15px.

### Workspace type

Geist Variable is bundled locally through `@fontsource-variable/geist`, with Segoe UI and sans-serif fallbacks. Code, paths, IDs, and timestamps use the frontmatter monospace stack. No external font fetch is required.

The hierarchy is compact but readable: page headings use `headline`, session titles use `session-title`, document section headings use `section-title`, and developer requests use the larger, relaxed `request` role. Request text preserves line breaks within (72ch); explanatory document text uses (13px / 1.8), usually within (75ch). Sequence titles and queue titles use (13px, weight 500). Property labels are (11px); values are (12px). Counts use tabular numerals where implemented.

Activity titles use (14px, weight 500), previews (13px), and tool previews/source payloads (12px monospace). Diff code is (12px); line numbers are (11px). Keep these current values rather than the former tiny diff scale. Below (800px), session titles reduce to (21px), request text to (14px), and activity titles/previews to (13px/12px). The mobile work-list title wraps above its (11px) capture-state label.

**The Reading Order Rule.** Use ordinary reading text for requests and human-readable gaps. Keep IDs and raw normalized records in source inspection or secondary properties.

## Layout

### Landing layout

The precise evidence desk places the review example near the offer. Content caps at 1180px with 48px side margins; the sticky header caps at 1360px with 32px margins and a 76px minimum height. Hero copy uses two columns, the example a 31% context rail, capabilities three ruled columns, and privacy/setup two columns. At 1100px, content margins become 32px and hero copy stacks. At 760px, margins become 20px, the header becomes 64px, anchor navigation hides, and the example/capabilities/privacy/setup stack. Theme and workspace access remain visible. Context properties use three columns; code scrolls within its panel. At 360px margins reduce to 14px. Anchor targets have 94px scroll clearance. See [the landing reference](../../docs/design/landing-page.md) for screenshots and full surface behavior.

### Workspace layout

The shell has a fixed sidebar (228px), toolbar (minimum 52px), and main workspace capped at (1640px), padded (24px 28px). The review maximum becomes (1600px) on wide screens. Stable navigation is Sessions, Needs review, and Project overview; the recent-session duplicate list is no longer the shell model.

Sessions uses one view toolbar, a grouped flat table, and rules rather than cards. Desktop columns allocate title/state/observations/gaps/date (44/20/12/7/17 percent); session buttons have minimum height (48px). Search, capture-state filter, and Display grouping/order controls belong to this list.

Review is a full reading document with a property rail (236px), gap (52px), and rail sticky top (20px). Opening exact evidence replaces that rail with a source inspector (380px), gap (24px), while preserving Review. Activity is a full-width ledger until evidence opens, when its inspector is (360–420px).

Needs review deliberately uses a split queue: list (270–340px), flexible detail, minimum height (560px). Changes keeps its dedicated path list and large scrollable code panel; usage and coverage retain their session-scoped layouts. Project overview is secondary, not the default entrance.

Responsive behavior follows the final cascade:

- At (1099px) and below, the property rail becomes (210px) with gap (26px), and exact source inspection uses a native dialog. Activity's inspected layout becomes one column. Work-list observation counts hide; queue list width becomes (280px).
- At (899px) and below, the queue switches to separate list/detail states with **Back to recorded gaps**. Selection never becomes a cramped side-by-side mobile pane.
- At (799px) and below, the sidebar becomes horizontal navigation (56px); workspace offset clears, toolbar is (48px), and page padding is (20px 16px). Review properties hide, but capture status remains beside the session heading. List date/state columns hide; state moves beneath each title, and the gaps column remains visible. Search takes a full toolbar row.
- At (559px) and below, before/after capture selectors stack and the source dialog becomes a full-width bottom sheet. At (359px) and below, secondary navigation text can collapse while icons retain accessible labels.

## Elevation & Depth

Landing depth uses rules and neutral tonal planes. Its 9px example panel has `0 24px 60px #00000018`; code has 5px corners and buttons 6px. The privacy symbol is circular. The example's 500ms clipping/8px reveal runs only under `prefers-reduced-motion: no-preference`; primary button backgrounds transition over 160ms ease-out.


Flat planes, fine rules, text hierarchy, and restrained selected fills carry most depth. Registers and review sections have no resting card shadow. Source inspection and temporary disclosures provide the exceptions: Display options use `0 8px 24px #00000024`; the source dialog retains `0 24px 70px #13224633`, with backdrop `#14203a66`. The inherited help disclosure uses `0 10px 30px #19294d1a`. Diff-layout selection now uses a flat neutral fill with no shadow.

Buttons and rows use (160ms ease-out) background/border transitions where defined. With motion permitted, Review arrives through a small clipping reveal (180ms ease-out); reduced-motion disables animations and transitions. Do not add decorative motion to captured evidence.

## Shapes

Controls use gently squared (6px) corners, code/disclosures (5px), and bounded working panels (7px). The main Review document is an open ruled reading surface, not a rounded card. Small provenance badges use (4px) corners. The desktop source dialog uses (10px), while the phone sheet uses (12px) top corners. Circular source-state dots accompany literal text.

Payloads wrap safely and scroll inside bounded regions; diff code preserves whitespace and scrolls horizontally. The code plane must not widen the document. Outline icons identify routes and record types without replacing labels.

## Components

### Landing interactions and boundaries

The header links to anchors and `/`; the example opens a specific local sample. Three evidence tabs share a labeled panel with roving tab stops, Arrow Left/Right, Home/End and a keyboard-reachable panel. A skip link and 2px accent focus ring with 5px offset support keyboard navigation. Theme updates document and landing attributes and persists the shared historical `traceframe-theme` local key; unavailable storage is tolerated. Copy writes the two demo commands, shows **Copied** or manual-copy guidance, and resets after four seconds. No displayed command is executed. Keep the synthetic label, source context, reported-check limitations, unknown full-suite coverage, capture bounds and separate code/untracked consent. The full workspace redesign is pending; the following patterns describe its current implementation.


### Navigation and theme

Neutral current-route fill and `aria-current` distinguish stable destinations; session tabs use an accent underline and `aria-selected`. Keyboard arrows move among tabs. The header includes theme and refresh controls; theme changes the root attribute, not only the control label. Local project/source context remains separate from collector connection status.

### Buttons and fields

Compact buttons have minimum height (32px), (13px) labels, and (6px) corners. Primary actions use the paired primary-fill palette; subtle/source actions use text emphasis. Disabled controls use opacity (0.5) and default cursor. Global keyboard focus is a (2px) accent outline offset (3px); enclosed rows use an inward offset where defined.

Search uses a leading outline icon, neutral background/rule, and a single enclosing focus treatment; the inner input suppresses a duplicate ring. Native selects preserve source terminology. Display is a disclosure with grouping and ordering controls, not a filter synonym. Search text never enters URLs. List filters persist while navigating in memory; reload resets them.

### Session work list

Grouped headings distinguish **No end recorded** and **End recorded**, each with a dot, label, and count. Rows open full Review. Hover/focus tint the row and expose its route arrow. Available observation/gap counts and UTC source dates remain supporting properties; unavailable counts show an em dash with retry text rather than zero. Loading, metadata-unavailable, no-retained-session, and no-match states explain recovery. On mobile, each title retains its explicit end-state text even when desktop property columns hide.

### Session document and properties

Review presents Developer request, Repository changes, Recorded work, and Unresolved evidence. Requests are captured prose, not generated summaries. Missing requests, absent captures, unknown dirty state, unpaired results, and bounded pagination remain explicit. Tools are paired only through an unambiguous explicit-ID relationship; unmatched results remain separate. Source actions expose the exact retained observation. Capture count alone does not establish a code change.

The property rail holds source, capture state, repository, UTC date, ID, observation count, code policy, and reported usage. Unknown values stay unknown. Failed session metadata replaces the document with a clear unavailable state and retry/navigation actions. Exact inspection stays beside Review; below (1100px), native modal focus, Escape dismissal, and restoration preserve the same source selection across breakpoint changes.

### Needs review queue

Each item shows a human-readable captured gap, session context, and uncertainty. Selection has a quiet violet wash; hover uses the neutral soft surface. Desktop preserves the queue beside detail; mobile uses list/detail with a return action. Detail leads with the recorded fact and limitation, then supporting source/provenance; raw JSON is disclosed on demand. Counts and paging describe loaded evidence. Partial failures remain incomplete with retry controls. There is no persisted resolve, snooze, or all-clear state.

### Activity, Changes, Usage, and Coverage

Activity retains search over the retained session, explicit filter states, source/receipt ordering, keyboard traversal, pagination, and optional exact inspection. Recorded and derived badges always include wording. Source views retain copy feedback, unavailable-content labels, relationships, source provenance, and normalized-record disclosures.

Changes retains before/after capture selectors, dirty/missing-baseline context, searchable status-labeled paths, unified/split controls, source links, explicit signs/line numbers, newline markers, and bounded paging. Unknown sides and inferred renames retain their basis/limitations. Selected code uses an inert, keyboard-scrollable region; no restore or replay action exists.

Usage retains category counts, labeled composition, formula, and supporting observations; unknown counts are never zero-filled. Coverage explains the evidence limits. Neither view creates a correctness verdict, productivity score, file cost allocation, or live-agent claim.

## Do's and Don'ts

### Do:
- **Do** select the layout for the task: work list, reading document, triage split, or code inspection.
- **Do** preserve readable captured requests, source actions, explicit uncertainty, and unknown values.
- **Do** implement both actual root themes with the paired token values.
- **Do** preserve mobile capture status, keyboard focus, source selection, and recovery from unavailable metadata.
- **Do** keep local Geist, neutral rules, compact controls, and restrained violet emphasis.

### Don't:
- **Don't** restore the municipal dashboard, cobalt selection system, or default overview as current authority.
- **Don't** make the normalized event ledger the only way to understand a session.
- **Don't** infer causality from proximity, authorship from a diff, or correctness from reported success.
- **Don't** turn a recorded gap queue into a defect score or an invented resolved workflow.
- **Don't** treat synthetic examples, local snapshots, or collector connectivity as live Claude integration.
