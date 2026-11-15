---
name: Quoli landing
description: A baby-blue pixel identity connecting coding-agent work.
colors:
  paper: "#f2f6f5"
  ink: "#172d43"
  muted: "#46627a"
  brand: "#315f85"
  baby-blue: "#a9d8f2"
  denim: "#477da8"
  cream: "#ffe5ad"
  tint: "#e0edf0"
  border: "#bdd5e5"
  surface: "#f7fbfe"
  night-paper: "#101c28"
  night-muted: "#b0c8dc"
  night-tint: "#1a3042"
  night-border: "#35526c"
typography:
  display:
    fontFamily: "Quoli Sans, system-ui, sans-serif"
    fontSize: "clamp(40px, 4.1vw, 60px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Quoli Pixel, monospace"
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 1.08
  body:
    fontFamily: "Quoli Sans, system-ui, sans-serif"
    fontSize: "17px"
    lineHeight: 1.7
rounded:
  control: "8px"
  frame: "18px"
  hero: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "13px 19px"
---

# Quoli landing design

## Overview

The owner's approved direction in [#159](https://github.com/ICEQ-JO/quoli/issues/159)
preserves the original pixel craft and replaces the reference-derived structure and
green-to-blue chapter progression. Baby blue is the consistent identity: bright,
approachable scenery, readable midnight lettering, and precise recording instruments.
This supersedes the previous structural reference to the reference site.

Applies only to `/landing/` and its Mission, Roadmap and Privacy views.
The application's separate design system remains in `DESIGN.md`.

## Colors

Ice blue is the page; baby blue and denim build the illustrations. Midnight carries
text, actions and terminal evidence; cream is a small light source or instrument
highlight. Do not switch brand color on scroll. Dark mode uses midnight surroundings,
light text and baby-blue actions; the hero artwork remains a bright illustration.

Activity colors in the synthetic terminal and actual product screenshots retain
their existing meanings. Decorative blue is not a new category of agent activity.
CSS custom properties in `web/src/landing/landing.css` govern the page;
`PixelScene.tsx` owns canvas shades, including cream highlights. `--accent` is
baby blue, `--dot` matches the border, and `--button`/`--button-ink` reverse between
midnight and ice blue by theme. `--error` is red for form errors.

## Typography

Self-hosted Jost (`Quoli Sans`) carries the headline, explanation and navigation;
Jersey 10 (`Quoli Pixel`) carries the wordmark and section headings. Both retain
their OFL licenses. Code and paths use monospace. Body copy is 15–18px, supporting
labels 12–15px. The mobile headline is 38px; product headings reach 50px on desktop.

## Layout

A single continuous sky field opens the page: promise and actions on the left,
a full-card original pixel panorama with a four-lens trace anchored at lower right. The hero reaches 1400px;
main marketing sections are bounded between 1140px and 1240px. Navigation is
1280px; informational pages are 820px. On mobile the same panorama fills the card behind the copy, with the signal station
framed beneath it.

The recording section leads with explanation above the working recorder, beside
an entirely inset terminal. The product introduction is left-aligned beside four
connected observatory rooms in a pixel hillside. Six product tabs sit to the left of the screenshot on desktop;
they become two rows of three above it on mobile. The developer/team section shows
local evidence, an opt-in summary conduit and a shared team view, then explains
visibility and control beneath it. The waitlist leads to a large pixel mission link and
a rounded blue footer with animated contour artwork, as requested by the owner.
A 1440px rule adds hero side margins; breakpoints at 1000, 760 and 440px
reflow content rather than clipping it.

## Elevation & Depth

Depth is local: the hero trace, terminal and screenshot use soft offset shadows.
The page and text sections stay flat; the footer contains original animated
contour art behind its content. Borders distinguish controls and
selected tabs. Pixel canvases render at low resolution without smoothing; the
hero uses an 840×420 panorama with object-fit cover. A local sky wash preserves
text contrast while letting the foreground span the entire card. The observatory panorama preserves a 2:1
aspect ratio; the FAQ archive uses 5:4. The mobile hero is at least 900px tall and crops toward the inhabited ridge. Trace points and connector share one bordered row.

## Shapes

Rounded outer frames hold crisp stepped artwork. Primary controls have 8px radii; form groups use 10px, and secondary
controls range from 4px to 6px;
terminal and screenshot frames use 18px, the desktop hero 24px.
The landing mark is an open stepped Q with a diagonal stepped trace and detached
square endpoint. It has a transparent interior and works in a single color.
The same geometry appears in the favicon, header, recorder summary and signup.

## Components

- Primary actions use midnight with ice-blue text, reversed in dark mode.
  Hover increases brightness; focus has a 3px outline offset 5px.
- The email form retains idle, saving, success and retryable error states. Success
  requires the existing API to confirm persistence. Storage behavior is unchanged.
- Product tabs retain roving keyboard focus, arrows, Home and End. Screenshots are
  the existing synthetic demo images in matching light/dark sets, with JPEG fallback
  and a retry state. Each image opens at full size.
- Recorder reels, lamps, paper and terminal stages share the existing synthetic
  session clock. Pause and replay work; offscreen/hidden canvases stop; reduced
  motion reveals the complete terminal without continuous animation and hides
  playback controls. Browser theme-color follows the selected theme.
- Mission, Roadmap and Privacy remain real query-addressed pages. Their footer
  navigation remains available on narrow screens.

## Do's and Don'ts

- Keep original pixel artwork and working mechanisms; use blue consistently.
- Keep evidence descriptions honest: synthetic examples, inferred relationships,
  estimated costs and hosted services without live connections.
- Distinguish current local capture and opt-in team summary sharing from planned
  detailed hosted session review and live provider connections. Do not invent customers, benchmarks, prices or availability.
- Do not recreate the reference site's paired green panels, chapter color switch. The owner-requested contour footer uses Quoli
  blue with verified readable foreground contrast. Do not apply landing colors to the app's semantic activity tokens.

## Owner refinement — signal valley

The November 13 owner review rejected the square desk, optical rail and empty
landscape bands. `pixel-art.ts` now supplies an original inhabited valley, four
observatory rooms and an archive field guide. Layered peaks, warm windows, timber
roof details, pine foliage, a waterfall and a cable signal establish depth. Moving
clouds, packets, steam and river highlights provide life without moving the copy.
The same canvas lifecycle stops offscreen and in hidden tabs and respects reduced
motion. There is no floating page-pause control, by explicit owner direction. The
synthetic walkthrough retains its separate transport controls.

The team section explains the actual sharing model in a wide schematic instead of
placing unrelated desk art beneath a long introduction. All summary fields reflect
the shipped model; no invented member metrics or activity counts.

## Commercial product presentation

Quoli is an open-source (MIT) product for developers, engineering teams and
students. Content leads with review context, agent effort/spend and opt-in team
visibility. The footer restores the owner's rounded
animated contour treatment, with ice-blue text over a darkened blue canvas.
The large pixel mission link replaces the compact text link. Canvas imagery is
decorative and does not replace readable links. Repository links are absent.

## Content and evidence expansion (review draft)

The landing now explains the connected review workflow, Usage, Insights, team
visibility, privacy, setup and practical questions in distinct sections. Original
synthetic-demo Usage/Insights screenshots provide proof in matching themes. Costs
are estimates and loop flags are investigative signals; detailed hosted review
and live provider connections remain distinguished from shipped capabilities.
Evidence sections alternate copy and screenshots on desktop and read copy-first
on mobile. FAQs use a single-open accordion with semantic buttons, expanded state,
controlled answer regions and inert closed answers. Grid expansion, a pixel plus/minus
sigil and a short content transition work with keyboard input. Reduced motion skips
transitions. The archive illustration provides the pixel-art treatment requested
for this section. Footer links and hover states use explicit ice-blue foregrounds
in both themes; scenery stays subdued behind them.

## November 15 panoramic art direction — Phase 1 #14

The hero now paints one landscape across the whole card: open sky, four mountain
layers, snow, two stations, pines and a winding river. Softer blue-white paper and
deeper night surroundings frame warmer cream highlights. Signal packets move at
62 scene pixels/second, the observatory conduit at 65; water and small bird flocks
provide contrasting rhythms. Canvas painting is capped near 30fps and retains
visibility, hidden-tab and reduced-motion controls. The recorder keeps its readable
session timing. The hero trace plays three 2.4-second passes; action arrows respond
in 180ms. Reduced motion disables both effects. At 320px, Research remains in the
hero and footer while the header keeps the brand, GitHub, theme and app controls.

## Full-page art extension — Phase 1 #14

The approved panorama now has companion mechanisms throughout the landing page:

- Recorder: a night workshop, mountain window, signal lights, moving meter and
  stacked field guides frame the existing twin-reel transport. Its clock, event
  order and Pause/Play/Replay controls remain unchanged. The readout has its own
  solid paper strip below the canvas.
- Observatory: sun, moving clouds, snow and foreground planting surround four
  instruments: receiving aerial, code reader, branching signal and spinning fan.
- Research plates: warm highlights, birds, wind, beacons and staggered packets
  extend the valley; the review plate scans papers and measurement plates move
  their levels. Shared journal plates receive the same treatment.
- Screenshot/terminal frames, team schematic and footer: fine survey contours,
  reference crosses and moving packets replace the broad filled bands. The team
  diagram adds monitor scan lines, lamps and sequential receiving lines; its
  local-evidence/opt-in-summary meaning is unchanged.
- FAQ archive: a sunlit mountain background, scan head, receiving antenna,
  turning page edge and feeding paper record give the field guide a working life.

CSS and SVG loops now pause outside the viewport, in hidden tabs and for reduced
motion, alongside the existing canvas lifecycle. Before JavaScript runs, CSS art
is still. Terminal and screenshot arrivals take 240ms, FAQ expansion 260ms and
arrow feedback 180ms. The existing palette, copy, real product captures and clear
privacy boundaries remain the visual and factual foundation. No motion library,
remote asset service or evidence access was added.
