---
name: Quoli landing
description: A recording garden on dotted paper, connecting agent work through original pixel mechanisms.
colors:
  paper: "#fff"
  ink: "#17232d"
  muted: "#56626b"
  brand: "#4f7d00"
  accent: "#78b400"
  tint: "#edf4df"
  border: "#e4e9e5"
  dot: "#e7ede8"
  blue-brand: "#086f94"
  blue-accent: "#008fba"
  blue-tint: "#e1f3f8"
  night-paper: "#121916"
  night-ink: "#e7eee8"
  night-muted: "#b5c2b9"
  night-border: "#344139"
  night-dot: "#27362b"
  night-tint: "#263c27"
typography:
  display:
    fontFamily: "Quoli Sans, system-ui, sans-serif"
    fontSize: "clamp(30px, 3vw, 45px)"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-1.5px"
  headline:
    fontFamily: "Quoli Pixel, monospace"
    fontSize: "38px"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.015em"
  brand:
    fontFamily: "Quoli Pixel, monospace"
    fontSize: "34px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.7px"
  body:
    fontFamily: "Quoli Sans, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.7
  label:
    fontFamily: "Quoli Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
rounded:
  control: "6px"
  navigation: "9px"
  field: "10px"
  hero: "20px"
  frame: "22px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "#fff"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "13px 15px"
  navigation-cta:
    backgroundColor: "{colors.brand}"
    textColor: "#fff"
    rounded: "{rounded.navigation}"
    padding: "11px 17px"
  hero-cta:
    backgroundColor: "#fff"
    textColor: "#17262b"
    rounded: "{rounded.navigation}"
    padding: "13px 20px"
  email-input:
    textColor: "{colors.ink}"
    padding: "12px 9px"
  signup-success:
    backgroundColor: "{colors.tint}"
    rounded: "{rounded.field}"
    padding: "20px"
---

# Design System: Quoli landing

## Overview

**Creative North Star: "The Recording Garden"**

The Recording Garden makes agent work tangible through original pixel forests, contour fields and a working twin-reel recorder. Dotted white paper and compact paired panels carry a lively green-to-blue progression. Rounded framing contains the pixel geometry; precise sans-serif explanation keeps the product legible.

This system applies only to /landing and its Mission, Roadmap and Privacy views. The reference site is the owner-pinned structural and material reference; the scenery, mechanisms, content and product demonstration are original Quoli work. The former city, robot and cottage direction is rejected and has no visual authority.

**Key Characteristics:**

- Compact equal hero panels over dotted white paper.
- Jost hero and body; Jersey 10 section headings and brand.
- Vivid lime-green and blue pixel fields with mechanical, state-driven motion.
- Real controls and clearly labeled synthetic evidence.

## Colors

Bright chapter fields sit against neutral paper; frontmatter is normative for reusable CSS root tokens. Illustration palettes remain in `PixelScene.tsx` rather than becoming interface tokens.

### Primary

- **Recording Green** (`brand`), **Lime Signal** (`accent`) and **Leaf Wash** (`tint`): actions, emphasis and supporting surfaces in the opening chapter.

### Secondary

- **Connection Blue** (`blue-brand`), **Blue Signal** (`blue-accent`) and **Sky Wash** (`blue-tint`): the root chapter overrides. The product frame, mission link and footer also use their established local blues.

### Neutral

- **White Paper**, **Blue-black Ink**, **Quiet Slate**, **Fine Border** and **Paper Dot**: page, text, secondary copy, separators and the dotted ground.
- The `night-*` tokens replace paper, ink, muted, border, dot and tint in dark mode. Brand and accent still follow the chapter; the dark tint remains the dark-mode override.

**The Chapter Color Rule.** Green introduces recording; blue introduces connected understanding. Chapter changes update brand, accent and tint together.

## Typography

**Hero / Body Font:** Quoli Sans, locally hosted Jost variable (weights 100–900), with system-ui and sans-serif fallbacks.
**Section / Brand Font:** Quoli Pixel, locally hosted Jersey 10 (weight 400), with monospace fallback.
**Evidence Font:** native monospace for terminal output, paths and selected evidence values.

The compact sans hero follows the pinned reference precisely; pixel lettering gives section titles and the brand their character. The display, base section, brand and body roles are recorded above. Contextual section headings range from the recorder’s 36px to the product title’s 46px; the mission invitation uses its own large responsive pixel scale. Navigation, evidence and captions use smaller contextual sizes rather than a universal body token.

At the narrow breakpoint the hero is 33px / 1.14, section headings remain prominent, and the product board switches to readable single-column content: 23px title, 12px tabs and explanation, and 11px paths. Preserve the final mobile overrides rather than earlier compact board values.

**The Two Type Voices Rule.** Keep the hero headline and explanatory text in Quoli Sans; section headings and brand lettering use Quoli Pixel.

## Layout

A slim sticky header (77px desktop) caps its content at 1090px. The equal two-column hero uses a 14px gap and outer gutter, compact 280px minimum panels and centered landscape type. The page ground repeats tiny radial dots on a 12px grid. The narrow identity strip introduces the four lenses without invented trust logos.

The recording section pairs the mechanical figure and copy with a tall terminal on green backing. A blue signal chapter leads to the product board on the left and three explanations on the right. A restrained waitlist, oversized mission link and full blue multi-column footer complete the page. Informational views use the same header, type, tokens and footer.

Responsive thresholds are 1600px minimum and 1100px, 780px and 520px maximum. The recording/product layouts stack at 780px; the hero stacks at 520px. The narrow board hides its sidebar, retains all four accessible tabs, and increases its evidence type. The smallest layout uses 8px outer gutters, wraps footer columns and keeps theme and waitlist controls available. Spacing is contextual, not an invented global scale.

## Elevation & Depth

Depth comes from overlapping contour bands, shaded fitted recorder parts and inset product frames. Rounded frames hold the art; the paper remains largely flat. Shadows are local and faint: a small lift under the hero action, a shallow form shadow, and stronger structural shadows beneath terminal and product surfaces. Do not promote every text block into a card.

Motion performs a mechanism: the shared synthetic session advances reels, tape, paper marks, lamps and terminal steps. Contour bands, forest details and blue signals move on low-resolution canvases with crisp scaling. Each canvas owns a cancellable animation loop, pauses offscreen or in a hidden document, and limits painting frequency. Pause and replay remain real buttons; reduced motion shows a readable still with terminal evidence visible. Do not infer product recording from the illustration.

## Shapes

Rounded outer panels and frames contrast with integer-grid contours, square signals and stepped brand geometry. Controls are softly rectangular; the frontmatter records their actual radii. One-pixel borders define evidence, tab rails and form groups. Circles are reserved for reel geometry, terminal window controls and small state indicators, rather than a general pill language.

## Components

### Buttons

Brand-filled waitlist controls use white sans labels, a compact arrow and the primary dimensions above. Navigation uses its own larger radius; the hero action reverses to white against the dark green field. Brand buttons darken with a brightness filter on hover; the hero action turns pale green. Focus uses a visible brand outline (3px, offset 5px); disabled submits reduce opacity and show a wait cursor.

### Inputs / Fields

A rounded, thinly bordered email/submit group uses 5px padding and a faint shadow. The flexible transparent input stays legible in both themes. Errors sit beneath the group; confirmed success uses a tinted status panel. Preserve the existing submission states and show success only after the API confirms it.

### Navigation

Pixel wordmark and stepped Q anchor a sans-serif navigation row. Links acquire the chapter brand on hover. Narrow layouts progressively remove middle links, retaining brand, theme control and waitlist. Mission, Roadmap and Privacy open real local informational views; the footer supplies full navigation.

### Cards / Containers

Equal rounded hero panels pair a bright original forest with a dark contour explanation field. The terminal’s charcoal surface is inset into green pixel backing; the interactive product board is inset into blue backing. The signup success panel and compact status tags remain contextual patterns, not generic cards.

### Product Board

Four tabs share one synthetic session. Blue text and a bottom rule mark the selected lens; arrow keys, Home and End move focus and selection. Selectable evidence rows use a pale mixed-blue fill and update the inspector. Keep tab relationships, explicit synthetic labels and the recorded/derived/inferred distinctions intact. The mobile board gives evidence the full available width.

### Recording Instrument

The original twin-reel canvas shows a continuous tape path, fitted head, guides, counter, transport buttons, indicator and paper feed. Recorded marks and terminal stages share the synthetic session clock. Canvas descriptions explain meaningful illustrations; decorative field canvases stay hidden from assistive technology. No external artwork or generated scene asset is required.

## Do's and Don'ts

### Do:

- Do keep this system scoped to /landing and its informational views.
- Do preserve the compact paired hero, dotted paper and crisp code-native pixel rendering.
- Do keep keyboard focus, pause/replay controls and readable reduced-motion states.
- Do retain synthetic, recorded, derived, inferred and planned labels where applicable.

### Don’t:

- Don’t restore the rejected city, robot mascot, cottage or game-world direction.
- Don’t use pixel lettering for the hero headline, paragraphs or evidence text.
- Don’t replace the working recorder with static generated scenery or floating image loops.
- Don’t apply these tokens to the existing application or invent customer proof, pricing or availability claims.
