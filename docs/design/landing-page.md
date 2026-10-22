# Traceframe Landing Page Design & Architecture

Status: Implemented on `feat/landing-page` for [GitHub #34](https://github.com/ICEQ-JO/quoli/issues/34).

## Overview

Traceframe answers: **“Show me what my coding agent did, what changed, and what remains unverified.”**

The landing page targets software engineers evaluating AI coding agents (Claude Code, Cursor, Codex). Developers are naturally skeptical of marketing superlatives and conversational AI claims. The landing page embraces this mindset through **Impeccable Persuade mode** and **Anatomy isometric craft**: replacing generic SaaS abstractions with an interactive physical instrument metaphor — **The Agent Flight Recorder (Rig TF-01)**.

## Visual Direction & Anatomy Rig TF-01

Following the Anatomy skill's core principle (*“The object is the explanation. Don't draw boxes, arrows and labels. Invent a real, well-made physical thing whose working is the concept.”*):

1. **Chassis & Base**: Heavy chamfered slate chassis on 4 knurled rubber feet, inset perimeter alignment groove, hex-head assembly bolts, and engraved serial plate `RIG TF-01 // AUDIT`.
2. **Reel-to-Reel Tape Drive**:
   - **Spool A (Raw Event Feed)**: Feeds the untrusted agent prompt and incoming tool stream.
   - **Spool B (Sealed Audit Ledger)**: Reels in the verified immutable events with four-tone depth shading.
3. **Linear Guide Rails & Scanning Carriage**: Twin ground stainless steel rails with hardened end-stops. A moving optical scanner carriage reads before/after AST file diffs with an illuminated laser target.
4. **Verification Dial Gauge**: Precision round dial indicator measuring verification confidence from `0% UNVERIFIED` to `100% GROUND TRUTH`. The needle deflects dynamically as the session advances.
5. **CRT / Oscilloscope Telemetry Monitor**: Angled terminal displaying phosphor scanlines and live packet waveforms for tool dispatches (`run_command`, `edit_file`, `git_checkpoint`).

## Interactive Simulation Stages

Visitors can scrub through or auto-play 4 distinct execution states:
- **01 // INGEST**: Untrusted agent prompt recorded into append-only memory. (0% Verified).
- **02 // DISPATCH**: Agent modifies file AST (`src/auth.ts`). Bounded diff scanner records delta without claiming correctness.
- **03 // CHECK**: Independent test execution (`pnpm test`) captured. Exit code and assertion counts recorded as separate facts.
- **04 // COMMIT**: Git working-tree snapshot sealed into local SQLite append-only storage. Dial needle locks to Ground Truth.

## Page Structure (Impeccable Persuade Mode)

1. **Sticky Header**: Brand mark with live status pill `v0.1.0-preview · LOCAL`, navigation anchors, light/dark theme toggle, and `Launch Workspace` CTA.
2. **Hero Section**:
   - Headline: *“Stop guessing what your coding agent touched. See the receipts.”*
   - Subtext: *“The local-first flight recorder for Claude Code...”*
   - Interactive 1-click install command snippet (`curl -fsSL https://traceframe.dev/install.sh | sh`).
   - The interactive Anatomy Rig TF-01.
3. **The Illusion of Success**: Side-by-side contrast comparing AI conversational claims vs Traceframe's immutable receipts.
4. **The Three Mechanical Pillars**:
   - Pillar 01: Append-Only Event Ledger (SQLite WAL mode, inert data policy).
   - Pillar 02: Bounded Diff & AST Engine (Explicit unavailable sides, no fabricated files).
   - Pillar 03: Air-Gapped Privacy Sandbox (100% loopback on 127.0.0.1, in-flight pre-persistence redaction).
5. **Evidence Inspection Workbench**: Interactive tabbed explorer demonstrating the 4 core views:
   - Session Review Document
   - Bounded Diff Editor
   - Needs Review Queue
   - Tool Provenance Join Graph
6. **Architecture & Terminal Specs**: Memory footprint (<42MB), loopback latency (<1.2ms), and zero external cloud telemetry.
7. **Footer**: Open-source license (Apache 2.0 / MIT), GitHub repository link, local-first assurance badge.

## Verification & Responsive Checks

- **Playwright Test Suite**: 19 tests passing (`19 passed (45.1s)`), including 5 dedicated landing page tests:
  - Hero headline & quickstart rendering
  - Interactive flight recorder stage stepping & telemetry updates
  - Theme switching between dark and light
  - Workbench tab switching
  - 390px mobile viewport verification (zero horizontal overflow: `scrollWidth <= innerWidth`)
- **Visual Artifacts**:
  - `docs/design/screenshots/landing-desktop-dark.png`
  - `docs/design/screenshots/landing-desktop-light.png`
  - `docs/design/screenshots/landing-hero-rig.png`
  - `docs/design/screenshots/landing-mobile-dark.png`
