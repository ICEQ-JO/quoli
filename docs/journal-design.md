# Quoli journal design

## Overview

The journal is a reading surface within the [landing identity](landing-design.md),
not a replacement for it or the app's `DESIGN.md`. Its thesis is “Read the work
behind agent output, with evidence attached.” The illustrated chronicle moves
from index to complete article, original sources and limitations, then Quoli.
Implementation evidence: `web/src/landing/Journal.tsx`, `JournalArt.tsx`,
`journal.css`, `articles.tsx`, and `scripts/journal.ts`.

## Colors

Text, links, dividers, quotations and disclosures inherit the landing's theme
variables. Original cover plates retain the bright ice/baby-blue/denim/midnight/
cream palette in both themes. They do not encode app activity categories.

## Typography

The index masthead uses Jersey 10 (`Quoli Pixel`), scaling from 56–80px on desktop.
Jost (`Quoli Sans`) carries article titles (42–65px), story titles (32px throughout the index) and reading copy (19px/1.8). Article section headings inherit pixel type
at 35px. Metadata is 13px; source explanations are 15px/1.75. Quotations use
29px/1.45 Jost with a stepped quote mark and explicit attribution.

## Layout

The index fits a 1140px container with 36px side padding; article pages retain
the 1240px reading frame. A large masthead leads
to alternating illustration/text rows divided by rules. All desktop covers use
360×225px (8:5), 48px column gaps and 36px row padding. The first article leads
through position, without a larger cover or headline.
Article headers pair title, introduction, topic, reading time and byline with a
cover. Below, a sticky 180px contents column sits beside reading copy capped at
720px, separated by 80px. The contents use native expandable `details`.

At 1000px, gaps and the contents column narrow. At 760px, content becomes one
column with 24px side padding; alternating artwork returns to document order.
The contents become static with two-column links, reading text becomes 18px/1.8,
article titles scale from 39–52px, and index story titles use 30px. Related stories stack. Covers preserve their
640:400 SVG view box; article covers are capped at 300px high on mobile.

## Elevation & Depth

Reading surfaces stay flat, separated by borders and tinted quotation/disclosure
blocks. Stepped shapes and contrasting planes create depth inside the art; its
drawn paper offsets are illustration details, not a new UI shadow rule.

## Shapes

Rounded 14px cover frames contain crisp-edged original SVG plates. Three
landscapes share mountains, pines and a cream light: paper connected to a monitor
for context, a magnifying lens over papers for review, and three physical gauges
for measurement. They are decorative (`aria-hidden`), never charts, screenshots
or measured product results.

## Components

- Story covers, titles and reading links navigate to the same article. Breadcrumbs,
  contents anchors, source citations, related stories and product links keep the
  reading path explicit. Links inherit landing focus styling.
- Numbered inline citations reach source entries showing original link, publication
  or research dates, method and limitations. A separate disclosure identifies
  Quoli's interest and excludes endorsement/customer-outcome claims. The DHH quote
  has its speaker, interview timestamp and source citation attached.
- Cloud, packet, steam, lens and gauge animations use CSS loops of 18, 4, 3, 9 and
  7 seconds respectively. Steam/gauges step; cloud/lens ease. Reduced motion
  disables all plate animation. These SVG loops have no explicit offscreen pause
  lifecycle; do not assume the landing canvas lifecycle applies.
- Direct paths are `/journal/`, `/journal/beyond-the-diff/`,
  `/journal/the-work-after-generation/`, and `/journal/activity-is-not-impact/`.
  The Vite plugin renders article content into initial HTML and emits these paths
  with titles, descriptions and canonical metadata. Its development middleware
  returns a readable not-found view with 404 status for unknown journal paths.

## Do's and Don'ts

- Do keep original illustrations subordinate to readable prose and source access.
- Do distinguish practitioner perspective, survey attitudes, experimental findings
  and Quoli's unmeasured product hypothesis. Preserve local-first product truth.
- Don't turn decorative gauges into evidence, imply researcher endorsement or
  invent customer studies, outcomes, pricing or availability.
- Don't promote this editorial composition into an app-wide design rule.

This record is based on source inspection. Runtime, visual, contrast and source
verification are not independently claimed by this documentation pass. Research
dates and “checked” statements describe the authored content, not checks rerun here.
