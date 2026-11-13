---
version: 1
slug: "web-src-landing-journal-tsx"
primary_target: "web/src/landing/Journal.tsx"
related_targets: ["web/src/landing/JournalArt.tsx", "web/src/landing/journal.css", "web/src/landing/articles.tsx", "scripts/journal.ts"]
---

# Quoli journal

Mode: Read. Audience: developers and engineering teams using coding agents.
Job: understand the review/context/measurement problem, read complete perspectives,
and inspect original sources with their methods and limits before exploring Quoli.

Thesis: Read the work behind agent output, with evidence attached. Illustrated
chronicle inside the existing baby-blue pixel identity. Jersey 10 masthead and
section lettering; Jost story titles and prose; flat reading surfaces; original
physical instruments in pixel landscapes. First viewport pairs a large editorial
title and spare introduction on the index; each article pairs title, description,
metadata and its own cover. No app redesign or semantic activity-token changes.

Index → article → numbered source notes → product. Desktop articles use a sticky
contents rail and 720px reading column; mobile stacks content and makes contents
static. Three decorative SVG covers depict context, review and measurement. Owner sizing
revision: equal desktop covers (360×225px), consistent 32px story titles and 48px
gaps, in a narrower 1140px index frame; mobile story titles are 30px.
Reduced motion disables their CSS loops; an offscreen animation pause is not
implemented. Artwork is not product evidence.

Routes: `/journal/`, `/journal/beyond-the-diff/`,
`/journal/the-work-after-generation/`, `/journal/activity-is-not-impact/`.
Initial HTML includes article content and per-page metadata via `scripts/journal.ts`.
Sources include original links, dates, method and limitations; the DHH quote keeps
its attribution and timestamp. Articles disclose Quoli's interest and are not
customer studies, endorsements or measured Quoli outcomes. Preserve the product's
current local capture and opt-in summary-sharing boundaries.

Identity: `docs/landing-design.md`. Surface details: `docs/journal-design.md`.
Documentation evidence is source inspection only; this pass did not rerun browser,
contrast, responsive, deployment or external-source checks. Do not inherit journal
composition as a global design rule or assume SVG loops use canvas lifecycle code.
