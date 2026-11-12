---
name: Quoli landing
description: A living coastal codebase city on quiet daylight paper.
colors:
  paper: "#f8fbf7"
  ink: "#192f31"
  green: "#245e4e"
  muted: "#52635d"
  line: "#dce5d9"
  copper: "#af5936"
  mint: "#edf3e8"
  white: "#fff"
  green-hover: "#174a3b"
  document: "#fffefb"
  night: "#173f34"
  night-ink: "#eff5dd"
typography:
  display:
    fontFamily: "Quoli Pixel, monospace"
    fontSize: "clamp(64px, 6.2vw, 92px)"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Quoli Pixel, monospace"
    fontSize: "clamp(42px, 4.1vw, 62px)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.018em"
  title:
    fontFamily: "Quoli Sans, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.5px"
  body:
    fontFamily: "Quoli Sans, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.75
  button:
    fontFamily: "Quoli Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
rounded:
  control: "2px"
  small: "3px"
  field-group: "4px"
  panel: "5px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 17px"
  button-primary-hover:
    backgroundColor: "{colors.green-hover}"
  navigation-cta:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    rounded: "{rounded.small}"
    padding: "12px 19px"
  email-input:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 9px"
  lens-detail:
    backgroundColor: "{colors.document}"
    padding: "40px 32px 25px"
---

# Design System: Quoli landing

## Overview

**Creative North Star: "The Living Codebase City"**

A living coastal codebase city makes connected work tangible: jade waterways, copper roofs, a small robot courier and four observation stations. The surrounding interface is quiet daylight paper, crisp pixel display lettering and natural, readable sans-serif text.

This record applies only to `/landing`, loaded through `web/landing/index.html` and `web/src/landing/landing.css`. It does not redefine the local application’s existing styles. The city is an illustrative metaphor; evidence excerpts retain their synthetic labels, and planned integrations remain visibly distinct from delivered capability.

**Key Characteristics:**

- Original pixel scenery and courier character on a sun-white ground.
- Large pixel headlines paired with readable sans-serif explanations.
- Restrained jade controls, copper focus and selected-station accents.
- Calm ambient movement with offscreen pause and reduced-motion support.


## Colors

Daylight neutrals leave the pixel landscape room to carry richer terrain colors. Frontmatter records the reusable interface colors; illustration colors remain in their source assets.

### Primary
- **Canal Jade** (`green`): primary waitlist buttons, selected lens tabs, wordmark and headline emphasis. `green-hover` deepens actionable controls on hover.

### Secondary
- **Roof Copper** (`copper`): keyboard focus and small identity accents; the station illustration also uses its own copper roof shades to identify the selected viewpoint.

### Neutral
- **Daylight Paper** (`paper`): page ground.
- **Harbor Ink** (`ink`): primary text.
- **Quiet Reed** (`muted`): explanatory copy.
- **Pale Reed** (`line`): major separators.
- **Mint Wash** (`mint`): supporting pale green surface vocabulary.
- **White** (`white`) and **Warm Document** (`document`): form and evidence surfaces.
- **Night Jade** (`night`) and **Moonlit Text** (`night-ink`): the privacy landscape’s inverse surface.

## Typography

**Display Font:** Quoli Pixel, the locally hosted Jersey 10 face, with monospace fallback.
**Body Font:** Quoli Sans, the locally hosted DM Sans variable face (weights 400–700), with system-ui and sans-serif fallbacks. Both source fonts are OFL licensed.

Pixel lettering gives headlines and the wordmark their world; sans-serif keeps explanation and interaction comfortable. Monospace is reserved for file paths and compact evidence values. Frontmatter describes desktop hero, section heading, lens title, hero paragraph and button roles; other copy deliberately varies by context.

The hero display changes to a mobile clamp (`58px` to `76px`, `14vw`) below the narrow breakpoint. Section headings remain large; compact evidence labels scale down with their containing panel rather than defining a global body size.

## Layout

The standard desktop content width is capped at 1184px with 48px side gutters; the hero and navigation have wider caps (1328px and 1304px). The hero splits copy and scenery into 47% / 53% columns. The city intentionally bleeds beyond its column, contained by the page’s clipped main area.

Breakpoints are 1550px minimum and 1150px, 800px and 540px maximum. Gutters narrow progressively. At 800px the hero and lens panel stack; at 540px story, review, privacy and FAQ stack, middle navigation anchors hide and the waitlist link remains. Forms retain adjacent email and submit controls. Section spacing is generous and context-specific, rather than a declared spacing-token scale.

## Elevation & Depth

Depth comes primarily from pixel terrain, four-tone building faces, overlapping scenery and pale surface changes. Interface shadows are faint: the city tag uses `0 6px 15px #34512b0a`, station controls use `0 3px 7px #2450380a`, and the review document uses `0 15px 35px #36522b08`. The latter also tilts slightly and has an offset backing sheet. Avoid treating every text section as a raised card.

Ambient movement includes slow cloud drift, a tiny courier bob, a short walking loop and flowing station signals. The landing pauses animations when marked still, and disables animation, transitions and smooth scrolling for reduced-motion preference. Movement supports the world without changing the evidence shown.

## Shapes

Small, almost square corners connect the controls to pixel scenery: control, small, field-group and panel radii are recorded above. Fine one-pixel borders delimit forms and evidence. Square status dots and stepped SVG icons repeat the pixel vocabulary. The small circular explore affordance is an existing local exception, not a general pill-button system.

## Components

### Buttons

Compact jade rectangles carry white sans-serif labels and an arrow. The primary waitlist control uses the frontmatter padding and a minimum height of 44px on desktop; the narrow layout uses 43px. Hover deepens jade. Keyboard focus uses a copper 3px outline offset by 5px. Disabled controls show a wait cursor and reduced opacity while a submission is saving.

### Inputs / Fields

Email and submit controls share a white, finely bordered field group with 5px outer padding and a faint shadow. The transparent, borderless input uses its own copper focus outline (2px, zero offset). Errors appear below the group with an alert; successful saves replace the form with a pale green status surface. Do not imply submission succeeded before the API confirms it.

### Navigation

The pixel wordmark and original stepped Q mark anchor a slim divided header. Text anchors are muted, turn copper on hover and retain keyboard focus. The right-hand waitlist link is jade. Narrow navigation removes the middle anchors rather than creating an unimplemented menu.

### Cards / Containers

The lens explorer joins four rectangular tabs to a bordered, two-column panel: pale green map on one side, warm document evidence on the other. The review excerpt uses a single tilted paper sheet. The privacy landscape is an inverse jade section. These are distinct contextual containers, not interchangeable dashboard cards.

### Lens Tabs and Station Controls

Four real tabs connect Agents, Code, Git and Infra to one selected viewpoint. Selected tabs invert to jade with white text; inactive tabs use pale green, with a deeper pale-green hover. Arrow keys, Home and End move selection and focus. Station buttons repeat the same selection in the map, using warm copper border and pale cream fill when active. Retain explicit labels and the synthetic evidence stamp.

## Do's and Don'ts

### Do:

- Do keep this system scoped to /landing.
- Do preserve crisp pixel rendering for scenery and courier assets.
- Do use sans-serif for paragraphs, forms and evidence explanations.
- Do preserve visible keyboard focus, tab keyboard controls and reduced-motion behavior.
- Do retain synthetic, derived and planned labels alongside the relevant content.

### Don’t:

- Don’t apply the landing stylesheet or its root tokens to the application.
- Don’t turn illustrative city signals into claims of live captured activity.
- Don’t replace readable body copy with pixel lettering.
- Don’t introduce unapproved customer proof, availability claims or pricing.
