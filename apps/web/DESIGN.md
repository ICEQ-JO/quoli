---
name: Traceframe
description: A local evidence workspace with municipal wayfinding, ruled registers, and paired inspection.
colors:
  bg: "#f7f8fb"
  surface: "#ffffff"
  sidebar: "#171e30"
  ink: "#20283f"
  muted: "#626d82"
  subtle: "#6b7588"
  line: "#e1e5ed"
  line-soft: "#eef0f5"
  accent: "#3659da"
  accent-dark: "#2647bd"
  selected: "#eef2ff"
  warning: "#91600e"
  warning-bg: "#fff8e9"
  negative: "#b13d4c"
  negative-bg: "#fff0f2"
  nav-selected: "#324ec0"
  nav-hover: "#242e46"
  nav-session-selected: "#273148"
  recorded: "#4965a4"
  recorded-bg: "#f0f4ff"
  derived: "#7257a6"
  derived-bg: "#f7f2ff"
  result: "#426d5d"
  result-bg: "#edf3f1"
  code-bg: "#202a40"
  code-text: "#d5dff5"
  failed-code-bg: "#342531"
  failed-code-text: "#f2bdc9"
typography:
  headline:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.9px"
  title:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: "20px"
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: "-0.4px"
  inspector-title:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: "17px"
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: "-0.35px"
  body:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  row-title:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 550
    lineHeight: 1.55
  label:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.55
  metadata:
    fontFamily: '"Geist Variable", "Segoe UI", sans-serif'
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.55
  payload:
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.9
rounded:
  badge: "3px"
  chip: "4px"
  field: "5px"
  control: "6px"
  project: "7px"
  panel: "8px"
  dialog: "10px"
  sheet: "12px 12px 0 0"
spacing:
  compact: "4px"
  small: "8px"
  label-gap: "10px"
  control-gap: "12px"
  inset: "16px"
  inset-wide: "20px"
  section: "24px"
  section-wide: "28px"
  page-block: "32px"
  page-inline: "36px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  button-primary-hover:
    backgroundColor: "{colors.accent-dark}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 13px"
  filter-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.accent}"
    rounded: "{rounded.chip}"
    padding: "5px 8px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0 10px"
  nav-selected:
    backgroundColor: "{colors.nav-selected}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  evidence-recorded:
    backgroundColor: "{colors.recorded-bg}"
    textColor: "{colors.recorded}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
  evidence-derived:
    backgroundColor: "{colors.derived-bg}"
    textColor: "{colors.derived}"
    rounded: "{rounded.chip}"
    padding: "2px 6px"
---

# Design System: Traceframe

## Overview

**Creative North Star: "Municipal wayfinding"**

Traceframe uses a stable ink navigation edge, a cool-white working field, compact Geist labels, and ruled registers to orient a developer before they inspect evidence. The committed direction is candidate 7, seed `2f68dc64`, recorded in the root layout. Cobalt marks selection and action; it does not certify an outcome.

The atmosphere is orderly, practical, and quietly precise. Desktop review pairs an activity register with a source inspector. Narrow screens preserve that relationship through a native evidence dialog. Explicit labels distinguish recorded observations, derived links, source-reported results, and capture uncertainty.

**Key Characteristics:**
- Ink navigation and a porcelain workspace.
- Ruled, aligned registers with compact outline icons.
- Cobalt selection; semantic source-state labels.
- Paired activity and evidence, with provenance disclosed on demand.

This is a scan of the implemented synthetic workspace, replacing the superseded muted-green identity. Sources are `app/globals.css`, `app/layout.tsx`, `app/dashboard.tsx`, and the workspace-home, evidence-inspector, and session-views components. No live ingestion, captured diffs, or graph surface is represented.

## Colors

The palette combines cool neutrals with a clear cobalt route through the workspace. Frontmatter is normative; names below explain application rather than introducing a second palette.

### Primary
- **Wayfinding Cobalt** (`accent`, `accent-dark`): primary actions, active session tabs, selected filters, links, and keyboard focus.
- **Selection Wash** (`selected`): selected activity rows and quiet selected controls.

### Secondary
- **Recorded Blue** (`recorded`, `recorded-bg`): the recorded-observation basis badge.
- **Derived Violet** (`derived`, `derived-bg`): derived calculation and explicit-ID relationship badges; related evidence uses pale violet borders and an ID-to-ID route.

### Tertiary
- **Capture Amber** (`warning`, `warning-bg`): recorded gaps, missing end events, and incomplete usage notices.
- **Reported Failure Rose** (`negative`, `negative-bg`): source-reported failed results and load errors, accompanied by explicit text.
- **Reported Result Green** (`result`, `result-bg`): compact exit-code/result labels. This is a semantic state, not the identity accent.

### Neutral
- **Ink Rail** (`sidebar`): persistent workspace navigation; selected primary routes use `nav-selected`, hover uses `nav-hover`, and current recent sessions use `nav-session-selected`.
- **Cool Paper / White Surface** (`bg`, `surface`): workspace field and bordered working panels.
- **Reading Ink / Supporting Slate** (`ink`, `muted`, `subtle`): content, explanatory labels, and quieter metadata.
- **Rules** (`line`, `line-soft`): panel outlines, major divisions, and row separators.
- **Code Ink** (`code-bg`, `code-text`): tool input/output payloads; failed output uses `failed-code-bg` and `failed-code-text`.

**The Evidence State Rule.** Pair every semantic color with wording, an icon, a number, or a source-state label. A successful exit code never becomes a feature-correctness verdict.

## Typography

**Body and heading font:** Geist Variable, bundled through `@fontsource-variable/geist`, with Segoe UI and sans-serif fallbacks. No remote font request is required.

**Code and identity font:** SFMono-Regular, Consolas, Liberation Mono, monospace.

### Hierarchy
- **Headline:** the page heading role; session titles reduce to (23px) on narrow screens. Overview headings reduce to (25px) below the paired layout breakpoint.
- **Title:** usage and coverage introductions. Panel headings use (14px, weight 550); the inspector has its own smaller title role.
- **Body:** the inherited reading foundation. Supporting panel prose is usually (11–12px), with longer cautions at (1.8) line-height.
- **Row title:** session, gap-queue, and activity titles; final stylesheet overrides establish this role, reducing to (12px) on phones. Activity previews use (12px), reducing to (11px) on phones; tool previews remain monospace (10px).
- **Label / Metadata:** compact controls and source details. Basis badges, fixture tags, and small timestamps use (9–10px). Labels are sentence case.
- **Payload:** wrapped monospace blocks. IDs and timestamps also use monospace; counts and usage totals use tabular numerals. The cache-share figure is a local emphasis (44px, weight 500, line-height 1.1), not a general display-heading style.

**The Source Readability Rule.** Keep ordinary labels in Geist and captured commands, IDs, paths, and payloads in monospace. Keep provenance subordinate to the captured content without removing it.

## Layout

Desktop uses a fixed left sidebar (224px), a white toolbar (minimum 66px), and a workspace offset by the sidebar width. Main content is centered within a maximum (1660px) and padded (32px 36px 20px). The overview pairs a flexible session register with a review queue (300px), separated by (24px); at widths of at least (1600px), the queue becomes (340px).

The review grid pairs activity and a sticky inspector in a (1.3fr / 1fr) relationship, with a minimum inspector width (340px), gap (22px), and sticky top (20px). Session facts and underlined tabs precede this pair. Register rows align title, capture state, observation count, and directional arrow. Rows become stacked entries on phones; the arrow remains a route cue.

Responsive thresholds are exact implemented media queries:

- At (1279px) and below: sidebar (200px), main inline padding (26px), overview queue (270px), and tighter grids.
- At (1099px) and below: overview and activity collapse to one column; the desktop inspector disappears and evidence opens in a native modal dialog. The gap queue can use two columns.
- At (799px) and below: navigation becomes a compact rail (68px), with icons and short labels; recent sessions and project/help blocks hide. Usage becomes one column. Main inline padding is (20px).
- At (559px) and below: navigation becomes a sticky horizontal top bar (58px), the workspace offset clears, main inline padding is (16px), and a native session select appears. Register columns become stacked entries, coverage becomes one column, and the gap queue returns to a single column.

Spacing uses compact (4–12px) control relationships and generous (16–36px) panel/page spacing. The source also uses local (18px, 22px, 26px, 30px) adjustments; it is not a strict universal 4px grid.

## Elevation & Depth

Working surfaces are flat at rest: white panels, cool workspace background, fine rules, and restrained tonal selection establish hierarchy. Shadows are reserved for temporary overlays, not registers or dashboard metrics.

### Shadow Vocabulary
- **Help disclosure:** `0 10px 30px #19294d1a` under the positioned synthetic-workspace explanation.
- **Evidence dialog:** `0 24px 70px #13224633` with backdrop `#14203a66`, separating a focused source inspection from its context.

Buttons and interactive rows change background and border over (160ms ease-out). There is no ornamental entrance animation. Reduced-motion preferences remove transitions and animations and restore automatic scrolling.

## Shapes

Panels use gently squared corners (`panel`); controls are tighter (`control`), fields and icon boxes tighter again (`field`), and chips use `chip` or `badge`. Borders are usually (1px), with straight ruled internal divisions. Small source-state dots are circular; they accompany labels rather than replacing them. The branded mark and authored outline icons use precise lightweight geometry.

The evidence dialog is rounded (`dialog`), capped at (560px) wide with (14px) outer margins and (88dvh) height. On phones it becomes a full-width bottom sheet (`sheet`) with a maximum height (91dvh). Payloads wrap long text and scroll vertically, capped at (420px).

## Components

### Buttons

Compact and explicit. Primary and secondary buttons share minimum height (36px), a (1px) border, and the frontmatter control shape/padding. Primary hover deepens the cobalt; secondary hover uses a pale neutral fill and stronger border. Subtle buttons remove the visible border, use muted text, and have minimum height (32px). Icon buttons are (32px) squares; text actions underline on hover. Disabled buttons use opacity (0.5) and the default cursor. Keyboard focus uses a (2px) cobalt outline offset (3px); the ink sidebar uses a lighter outline.

### Chips

Filter buttons are compact outlined shapes, with a pale cobalt selected fill and `aria-pressed` state. Unselected hover is a quiet neutral fill. Gap counts add amber badges. Recorded and derived basis chips are visually distinct and always contain explicit source wording. Fixture tags and capture-state labels retain their literal meanings; “End recorded” does not mean complete capture.

### Cards / Containers

Session registers, activity, review queue, usage, coverage, and the inspector use white surfaces, fine rules, and the panel radius without resting shadows. They are working regions, not floating promotional cards. Headers and content use roughly (16–24px) insets; usage/coverage uses (28px 30px) on desktop, reducing responsively.

### Inputs / Fields

Search combines a leading outline icon with a border, field radius, and minimum height (36px). Its focus-within border becomes cobalt with a pale (2px) outline; the inner input suppresses a duplicate outline. A clear action appears when text exists. Sort and capture-state fields are native selects. Search labels remain accessible even when placeholder text is visible.

### Navigation

The ink rail contains the brand, local project, primary routes, recent sessions, and local-evidence guidance. Primary routes use filled cobalt selection (`aria-current`); recent-session selection uses a quieter ink tone. Session tabs use a cobalt (2px) underline and `aria-selected`, with arrow-key movement. Responsive rail and top-navigation behavior follows Layout; it does not become a separate visual language.

### Activity and evidence inspection

Activity rows have an icon box, title and preview, source timestamp, receipt sequence, and route arrow. Hover is a quiet surface change; selection is the cobalt wash. Source-reported failures and capture gaps change the symbol state and retain explicit labels. Keyboard arrows move through observations; on desktop selection updates the paired inspector.

The inspector starts with a recorded-observation badge, title, ID, time, and evidence-link action. Captured text comes before related evidence and collapsible provenance/raw data. Related request/result evidence uses a violet explicit-ID join, supporting observation IDs, a rule disclosure, and uncertainty text. Empty, loading, copy-success, copy-failure, and unavailable-content states use explanatory text; skeletons remain static.

Below the paired-inspector threshold, the same content opens with native `showModal()`. A sticky header contains the title and close action; Escape dismisses and the originating activity row regains focus. The modal locks background scrolling. Following related evidence changes the inspected source rather than replaying it.

### Usage and coverage

Usage aligns categories and explanations with right-aligned reported counts, a labeled composition bar, and a separate derived cache-share explanation. The formula and source observations remain available. Unknown values render as an em dash or “Unknown,” accompanied by missing-data text. Coverage is an explicit list of what capture establishes and what remains unavailable. No fabricated cost, productivity score, live-integration state, diff, or graph should be inferred from these components.

## Do's and Don'ts

### Do:
- **Do** use cobalt for routes, actions, and selection, and explicit semantic labels for evidence states.
- **Do** keep activity and source inspection adjacent on desktop and use the native evidence dialog on narrower screens.
- **Do** preserve fine register rules, aligned counts, compact Geist labels, and monospace source material.
- **Do** show unknowns and capture limitations where the reader interprets the evidence.
- **Do** preserve keyboard focus, native controls, responsive reflow, and reduced-motion behavior.

### Don't:
- **Don't** restore the superseded olive-green identity or make semantic result green the primary accent.
- **Don't** use color alone to distinguish recorded, derived, failed, or incomplete evidence.
- **Don't** turn command success, an end event, or an explicit ID link into a correctness claim.
- **Don't** present synthetic examples as live ingestion, referenced paths as captured diffs, or relationship routes as a graph feature.
- **Don't** add resting shadows or ornamental animation to the working registers.
