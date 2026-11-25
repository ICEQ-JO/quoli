# Design

Recorded from the built system after the 2026-11 redesign (docs/redesign.md, R1–R6). The tokens live in `web/src/styles.css` and the layout in `web/src/redesign.css`; this file says why they are what they are. Product context is in PRODUCT.md.

## Character

Quoli is a tool for working, not a showcase. Scanning comes first: a developer next to a terminal should get "what changed, what did it cost, what do I review" in under a minute. The look is in the spirit of Linear: quiet, neutral chrome, dense but calm rows, and colour only where it means something.

## Colour

- **The chrome is neutral.** Surfaces go up one step per layer: `--bg` → `--panel` → `--raised` → `--hover`. Dividers are `--line` and `--line-strong`. The accent is near-white on dark and near-black on light, never a brand hue.
- **Hue is reserved for meaning.** The same meanings hold in every lens, in the legend and on the timeline:

  | Token | Meaning |
  | --- | --- |
  | `--read` blue | read a file |
  | `--edit` orange | edited a file; an orange glow or border always means "the agent changed this" |
  | `--run` teal | ran a command |
  | `--search` yellow | searched |
  | `--agent` purple | subagent |
  | `--web` pink | web or MCP |
  | `--fail` red | failed |
  | `--ok` green | succeeded, live |

  `--brand` (orange) appears only in the logo.
- **Text pairs** `--text`, `--text-2`, `--muted` and `--faint` meet WCAG AA on their surfaces in both themes. `tests/theme-contrast.test.ts` enforces this. Tinted surfaces (for example the orange "changed" cards) use `--muted` rather than `--faint` for secondary text.
- **Themes.** Dark is the default, and Light is a full theme rather than an inversion. System follows the OS. The choice is applied before first paint.

## Type

- **Inter Variable** is the UI face. **JetBrains Mono** is used for paths, branches, shas, commands, numbers in tables and code.
- Scale: 11 / 12 / 13 / 15 / 18 / 22px (`--fs-xs` … `--fs-2xl`). Body text is 13px.
- Page titles are 22px at weight ~640 with slight negative tracking. Section titles are 13px semibold. Labels never use all caps, except the small column headers on canvases.
- Numbers use tabular figures (`.num`).

## Space and shape

- **Spacing** uses a 4px base: `--sp-1` … `--sp-6` = 4–32px.
- **Radii** are 6px (`--radius`) for controls and rows, and 10px (`--radius-lg`) for panels.
- **Borders and shadow.** Panels are separated by a 1px line rather than shadow. Only floating things (palette, menus, toasts, canvas legends) carry `--float-shadow`.
- **Shell.** A 232px navigation sidebar (Dashboard, Sessions, Usage, Projects, Settings) sits beside the page. The project board has a top bar (project, branch, lens tabs, search, details toggle), the session list, the lens canvas and an optional inspector. The replay bar runs along the bottom.

## Components and patterns

- **Session rows.** Each row has a live dot, a title, and a meta line (project, branch, time, calls, failures). Next to them sit the call strip (one bar per tool call, coloured by kind) and the estimated cost. In the meta line, only the branch name truncates.
- **Segmented controls** switch views inside a lens (Steps/Lanes, Changes/All files, This session/Uncommitted, Direct imports/Two steps).
- **Canvases** (React Flow) show a dotted background, fixed-size cards, a legend at the bottom left and zoom controls at the bottom right. Declared edges are solid and inferred edges are dashed.
- **The inspector** is the details panel on the right. In the Agents Steps view, a call's details open in place instead.
- **Empty states** say what is missing and why, plus what makes it appear. Nothing is invented to fill a canvas.
- **Honesty markers.** Values Quoli lacks are shown as missing ("not connected", "No live status", "inferred"), never estimated silently. Hosted providers are always marked not connected until phase 4.
- **Icons** are inline SVG at 16px, using `currentColor`. No glyph icons and no emoji.

## Motion

- Motion is short and functional. Hover backgrounds take 120ms. A call detail settles open in 160ms. The canvas camera moves in 350ms when it fits to a selection. Live dots pulse.
- `prefers-reduced-motion: reduce` turns all CSS motion off and makes canvas camera moves instant.

## Accessibility

- axe-core reports 0 violations on every page in both themes. Last checked on the synthetic large demo at 1280px and 1600px.
- No page scrolls horizontally at 1280px.
- All controls are keyboard reachable: a skip link, visible focus rings, roving focus on canvas cards, and `?` for the shortcuts.
- Colour is never the only signal: kinds have icons and labels, failures have text, legends name every mark.

## Code lens exploration (#50, #52, #53)

The production Code lens uses the existing neutral surfaces, semantic colours, Inter and
JetBrains Mono. It starts with HTTP entry points, tables, exported functions and files;
**Find code** searches indexed source. No session is needed. The isolated synthetic
prototype remains a design reference, not the production experience.

A deliberate working set stays beside the real source reader. The exploration trail
preserves visited selections; **Who uses this** and **What this uses** show counts of
connections still hidden and reveal a bounded batch. Existing cards keep their positions
when selecting or expanding. Selection does not refit the camera; **Fit exploration** is
explicit. **Project overview** clears the working set. That set persists in memory while
the lens is mounted, rather than promising a saved board.

Cards use neutral selection borders, kind icons and file/line references. Orange remains
reserved for recorded file edits. Relationship arrows carry verbs; possible relationships
are dashed and labelled. **Connections in source** repeats connections as keyboard-reachable
buttons with source locations, providing an alternative to canvas navigation. The source
reader sits alongside on wide screens and below the exploration at 1100px and narrower;
at 700px and narrower, starting-point navigation stacks above it.

Evidence labels distinguish **File edited · recorded** and **File read · recorded** from
**Edit text matched here · derived**. The legend and status explain that relationships
come from current source. Related tests are labelled as imports, not evidence of a test
run. Preserve these distinctions beside the graph and source, rather than relying on
colour alone.
