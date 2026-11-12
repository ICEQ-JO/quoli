---
version: 1
slug: "web"
primary_target: "web"
related_targets: []
---

# Quoli app (web)

Mode: Operate. Audience: a developer beside a terminal running Claude Code, checking what the agent did, what it cost and what to review. Build path: code-led (app screen).

## Direction contract

seed: none (direction pinned by owner: "Linear-like dashboard design")

THESIS: A calm, dense working tool where colour only ever means something. Refuses the dashboard-of-cards default: pages are lists, tables and one chart, grouped by thin rules, not tiles.

OWN-WORLD: Cool neutral greys (dark: near-black blue-grey ground, lifted panels; light: cool white and grey, no cream). Inter variable for UI at 13 px, JetBrains Mono only for code, commands, paths, hashes and numbers in tables. 1 px hairlines, 6 px radii, soft offset shadows only on floating layers. UI chrome (selection, focus, primary button) is neutral; the hue palette is reserved for meaning: blue read, orange edited, teal ran, yellow searched, purple subagent, pink web/MCP, red failed, green ok.

SIGNATURE MOVE: the activity trace: one tick per tool call, coloured by kind, in time order. It appears in session rows, on the Dashboard, and as the replay bar, so the same glyph reads everywhere as "what the agent did".

STORY: Open Quoli → Dashboard says what is live, what needs review, what it cost. Pick a session → the board tells the story; select anything → the exact detail slides in.

FIRST VIEWPORT: labelled sidebar (Dashboard, Sessions, Usage, projects, Settings); Dashboard leads with live sessions and the review queue, spend as one line of numbers with a 14-day bar chart, no hero metric tiles.

RISKS: drifting into grey sameness; keep semantic colour visible in traces, statuses and charts.
