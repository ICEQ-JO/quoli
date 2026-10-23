# D01 direction gate

Status: **resolved — direction D chosen**. Date: 2026-10-23. Tracking: [QUO-82](https://linear.app/quolii/issue/QUO-82/d01-rebuild-quolis-visual-system-workspace-uiux-and-landing-page-from), landing increment [QUO-83](https://linear.app/quolii/issue/QUO-83/d02-rebuild-the-landing-page-in-the-chosen-black-evidence-direction).

Open [index.html](index.html) in a browser. Use the **Landing / Workspace** switch in each board. All evidence is synthetic; no private session, credential or real provider price is used.

## Why this gate exists

The current interface reads as a generic developer dashboard: default layout, a familiar dark/fern palette, a card-and-tab landing and a standard sidebar workspace. For a paid evidence product, that visual language undersells the one thing Quoli actually owns: a provenance-first record of what an agent did, what changed, and what remains unknown.

These are three complete visual worlds, not three colour skins. Each shows the same synthetic session so the comparison is about the world, not the content. One becomes the direction; the others are recorded as rejected.

## A — The Surveyor's Field Book

**Lead proposal.**

**Thesis.** Agent work is territory. Quoli is the survey sheet: known points, measured lines and deliberately blank ground.

**World.** A working survey sheet and field book: stone paper, graphite ink, vermilion survey marks, water teal for derived links, olive contour lines. No gradients. Depth comes from rules, tone and the map itself.

**Landing.** A survey sheet with a title block, a measured route through request → change → check, a hatched “not surveyed” area and a session card. The headline is “Survey the work your agent left behind.”

**Workspace.** A field-book spread: a ruled survey index, an open review document with a captured diff and reported checks, and a narrow instrument rail with provenance and a local-only stamp.

**Signature interaction.** A bearing line connects a selected evidence mark to its exact source; unsurveyed ground stays hatched and labelled. One authored motion: contour lines draw once when a survey opens. Reduced motion removes both.

**Why it fits.** The product is a record of what was measured, by which instrument, and what remains unknown. A survey gives gaps a native visual language instead of a warning card. It is distinctive without inventing capability.

**Honest risk.** The metaphor can overpower a utility. The paper world must stay disciplined, readable in dark mode and fast at 390px. If survey language appears in every label, it becomes costume; keep it in structure and evidence marks, not error copy.

**Best if** you want the product to feel like a precise instrument with a point of view, and you are willing to accept a warmer, more editorial workspace.

## B — The Phosphor Terminal

**Alternate.**

**Thesis.** Quoli is a recorder you read like a terminal transcript. The session is the primary object; every derived view is a command output.

**World.** P1 phosphor green on near-black glass, dim green history, amber unknowns, one monospaced face. Hierarchy comes from indentation, case and full-width rules. No cards.

**Landing.** A terminal that opens a synthetic session, prints the request, diff, checks and gap, then shows a readout timeline. The headline is “See what your agent actually did.”

**Workspace.** A terminal-native workspace: function-key navigation, a session transcript, a review document printed as sections, a provenance rail and a command line.

**Signature interaction.** The cursor breathes; a line lands with a short bloom; the transcript is the interface. Reduced motion removes the blink and bloom.

**Why it fits.** Developers already read agent work in terminals. The transcript is the primary record, so provenance and raw evidence are native instead of hidden in an inspector. It is the most direct answer to “show me what happened.”

**Honest risk.** Terminal cosplay is a real trap. Long review documents, settings and onboarding need readable typography and real focus states, not a command line for everything. If every action becomes a typed command, the product becomes hostile.

**Best if** you want the strongest immediate recognition for terminal-native developers and are comfortable with a darker, more austere product.

## C — The One-Bit Desktop

**Alternate.**

**Thesis.** Quoli is a desktop for agent evidence: windows, folders and a trash can, rendered in one bit. The interface is a place, not a page.

**World.** An early one-bit desktop: black, white and ordered dither; 1px window chrome; inverted selection; drawn triangles and check boxes. No accent colour.

**Landing.** A tiled desktop with a “Read me” window, a Sessions window, a Warnings window, a Checks window and a “How it works” window. The headline is “Your agent's work, on one desktop.”

**Workspace.** A tiled desktop: Sessions and Changes on the left, the Review document in the centre, Instrument and Warnings on the right, with desktop icons for Sessions, Changes and Trash.

**Signature interaction.** Marching ants around the selected session; a window zoom from folder to document. Reduced motion turns the selection into a static dotted outline.

**Why it fits.** A workspace is a place. Windows are a natural container for sessions, evidence and gaps, and the one-bit constraint forces hierarchy and clarity. It is the most differentiated of the three and the easiest to recognise after one viewport.

**Honest risk.** Novelty can become costume. Real windows need real focus, drag and z-order, or a fixed tiled layout that only looks like windows. Mobile, keyboard navigation and long review documents are the hard parts; the desktop metaphor must not become a puzzle.

**Best if** you want the most memorable, category-breaking surface and are willing to invest in the interaction model.

## D — The Evidence Field

**Chosen by the owner on 2026-10-23.** Proposed after the gate, from a landing reference the owner supplied.

**Thesis.** Agent work is a field of evidence: captured points, derived links and explicitly labelled unknown ground. Quoli is the instrument that reads it.

**World.** Pure black, Inter for interface text and a single Instrument Serif italic accent for emphasis. Liquid-metal navigation pills, one solid white action, thin grain, and a drawn evidence constellation instead of a stock hero video. No cards, no invented metrics, no external media.

**Landing.** One fold: badge, a two-line headline ("Every agent change, / *accounted for*."), one citation sentence, two actions, and a three-beat pipeline row. Four ruled sections follow: How it works, Evidence, Privacy, FAQ, then a footer.

**Workspace.** Not yet designed or implemented. Workspace adoption remains D01 increment 3 and keeps the existing fern/Geist system until then.

**Signature interaction.** The evidence field labels every node recorded, derived or inferred, and the gap edges are the only moving part. Reduced motion removes the drift and the entrance reveal.

**Why it fits.** It keeps the owner's preferred restraint and typographic contrast while replacing the template's fabricated social proof and external video with the product's own provenance language. Every hero claim is either a product definition or explicitly marked planned.

**Honest risk.** The dark liquid-metal treatment is closer to conventional premium SaaS than A, B or C, and the glass/gradient pills sit against D01's anti-goals. The direction is accepted because the owner chose it; the evidence field and the provenance labels are what keep it from being a generic dark template.

## Decision

- **Chosen:** **D — The Evidence Field** (owner-supplied black/Inter/Instrument Serif direction, applied to the landing in QUO-83).
- **Rejected:** A — The Surveyor's Field Book; B — The Phosphor Terminal; C — The One-Bit Desktop. Each was a complete world and none is being implemented.
- **Rationale:** The owner preferred the supplied reference. It carries the clean black/serif contrast the owner asked for; the fabricated stats and stock video were replaced with the product pipeline and a synthetic evidence field.
- **Trade-off accepted:** D is less category-breaking than A or B and uses glass/gradient pills. It is dark-only for the landing; workspace light/dark is unchanged.
- **Date:** 2026-10-23.

The earlier A/B/C boards remain in [index.html](index.html) as the record of what was rejected. They are not a second live direction.

## What happens after the choice

1. Record the decision here and in `docs/decisions.md`.
2. Update `docs/design/session-workspace.md` and `docs/design/landing-page.md` with the chosen direction and rejected alternatives.
3. Build the token system and typography first, then the landing page, then the workspace shell and core screens, then components and UX states. Each is a separate PR with evidence.
4. Keep `apps/web/DESIGN.md` current from the built world, not from the mock.
5. Do not start a half-applied theme. The existing evidence links, keyboard paths, local demo and privacy controls must keep working.

## Evidence

Screenshots captured at 1440px from the static artifact:

- [A — landing](shots/d01-a-landing.png), [A — workspace](shots/d01-a-workspace.png)
- [B — landing](shots/d01-b-landing.png), [B — workspace](shots/d01-b-workspace.png)
- [C — landing](shots/d01-c-landing.png), [C — workspace](shots/d01-c-workspace.png)
- [Full page](shots/d01-full.png), [mobile](shots/d01-mobile.png)

The screenshots are design evidence, not a claim that any direction is implemented.
