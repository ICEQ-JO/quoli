"use client";

import * as React from "react";
import { Dots, Line, Solid, Wire } from "../iso/draw";
import * as k from "../iso/iso-kit";
import { asksForStillness, useStillness } from "../iso/live";

export interface StepInfo {
  id: string;
  label: string;
  stage: string;
  tool: string;
  verification: string;
  confidence: number; // 0 to 1
  hash: string;
  diffSummary: string;
  description: string;
}

export const FLIGHT_STEPS: StepInfo[] = [
  {
    id: "step-1",
    label: "01 // INGEST",
    stage: "INTENT CAPTURE",
    tool: "prompt: 'refactor auth token verification'",
    verification: "CLAIMED ONLY (0% VERIFIED)",
    confidence: 0.05,
    hash: "0x8fa1..c92",
    diffSummary: "0 files touched · baseline clean",
    description:
      "Session baseline established. Untrusted agent prompt recorded into append-only memory.",
  },
  {
    id: "step-2",
    label: "02 // DISPATCH",
    stage: "TOOL EXECUTION",
    tool: "edit_file('src/auth.ts')",
    verification: "UNVERIFIED MUTATION",
    confidence: 0.35,
    hash: "0x3bc4..e71",
    diffSummary: "+28 / -12 lines · AST node modified",
    description:
      "Agent modifies file AST. Bounded diff scanner records delta without claiming correctness.",
  },
  {
    id: "step-3",
    label: "03 // CHECK",
    stage: "ASSERTION AUDIT",
    tool: "run_command('pnpm test auth')",
    verification: "INDEPENDENT TEST PASS",
    confidence: 0.78,
    hash: "0x6de2..90f",
    diffSummary: "18 assertions passed · exit 0 confirmed",
    description:
      "Test execution captured independently. Exit code and assertion counts recorded as separate facts.",
  },
  {
    id: "step-4",
    label: "04 // COMMIT",
    stage: "SEALED LEDGER",
    tool: "git_checkpoint('feat: strict jwt token')",
    verification: "GROUND TRUTH RECORDED",
    confidence: 1.0,
    hash: "0x7f3a..b44",
    diffSummary: "Snapshot linked · audit trail sealed",
    description:
      "Session audit completed. Git tree snapshot sealed into local SQLite append-only storage.",
  },
];

const PROJECTION: k.Projection = {
  origin: [430, 240],
  scale: 1.5,
  azimuth: 45,
  elevation: 30,
};

// Base chassis geometry
const BASE_PLAN: k.Plan = { x: -142, y: -74, w: 284, d: 148, r: 8 };
const BASE_INSET: k.Plan = k.insetPlan(BASE_PLAN, 4.5);
const RULER_PLAN: k.Plan = { x: -120, y: 60, w: 240, d: 8, r: 1.5 };
const NAMEPLATE_PLAN: k.Plan = { x: -132, y: -64, w: 42, d: 18, r: 2 };

// Dial gauge location and specs
const DIAL_CX = -50;
const DIAL_CY = -30;
const DIAL_RADIUS = 22;
const DIAL_Z0 = 2;
const DIAL_HEIGHT = 16;
const DIAL_FACE_Z = DIAL_Z0 + DIAL_HEIGHT;

// CRT Terminal location and specs
const CRT_PLAN: k.Plan = { x: 32, y: -58, w: 64, d: 52, r: 5 };
const CRT_Z0 = 2;
const CRT_HEIGHT = 26;

// Spool locations
const SPOOL_A_CX = -82;
const SPOOL_A_CY = 14;
const SPOOL_B_CX = 82;
const SPOOL_B_CY = 14;

// Linear guide rail specs
const RAIL_X_START = -32;
const RAIL_X_END = 32;
const RAIL_Y1 = 8;
const RAIL_Y2 = 20;
const RAIL_Z = 6;

export function FlightRecorderRig() {
  const [mounted, setMounted] = React.useState(false);
  const [activeStep, setActiveStep] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const stillness = useStillness();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Step ticker
  React.useEffect(() => {
    if (!isPlaying || stillness) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % FLIGHT_STEPS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [isPlaying, stillness]);

  const step = FLIGHT_STEPS[activeStep];
  const progress = activeStep / (FLIGHT_STEPS.length - 1); // 0 to 1

  // Dynamic mechanical variables
  const tapeRadiusA = 30 - progress * 13; // 30 -> 17
  const tapeRadiusB = 17 + progress * 13; // 17 -> 30
  const carriageX = RAIL_X_START + progress * (RAIL_X_END - RAIL_X_START);
  const needleAngle = -Math.PI * 0.75 + step.confidence * Math.PI * 1.5; // sweep across dial

  // Base geometry solids
  const halo = React.useMemo(() => k.haloOf(BASE_PLAN, -14, 8, PROJECTION), []);
  const baseSlab = React.useMemo(() => k.slabOf(BASE_PLAN, -10, 10, PROJECTION, 8, 1.4), []);
  const baseGroove = React.useMemo(() => k.planOutline(BASE_INSET, 0, PROJECTION), []);
  const baseScrews = React.useMemo(() => {
    return k.corners(BASE_PLAN, 8).map(([cx, cy]) => ({
      circle: k.ring(cx, cy, 2.2, 0, PROJECTION, 16),
      center: k.iso([cx, cy, 0], PROJECTION),
    }));
  }, []);

  // Feet under corners
  const feetSolids = React.useMemo(() => {
    const rawCorners = k.corners(BASE_PLAN, 16);
    // Sort by depth for painter's order
    const sorted = [...rawCorners].sort(
      (a, b) => k.depthOf([a[0], a[1], -14], PROJECTION) - k.depthOf([b[0], b[1], -14], PROJECTION),
    );
    return sorted.map(([cx, cy], i) => ({
      id: `foot-${i}`,
      flange: k.cylinder(cx, cy, 7, -15, 2, PROJECTION, 20),
      body: k.cylinder(cx, cy, 5.2, -13, 3, PROJECTION, 20),
    }));
  }, []);

  // Front ruler strip with ticks
  const rulerSlab = React.useMemo(() => k.slabOf(RULER_PLAN, 0, 1, PROJECTION, 3), []);
  const rulerTicks = React.useMemo(() => {
    return k.topTicks(
      RULER_PLAN.x + 4,
      RULER_PLAN.x + RULER_PLAN.w - 4,
      4,
      5,
      RULER_PLAN.y + 1,
      1,
      [2, 4],
      PROJECTION,
    );
  }, []);

  // Serial nameplate
  const nameplateSlab = React.useMemo(() => k.slabOf(NAMEPLATE_PLAN, 0, 1.2, PROJECTION, 4), []);
  const nameplateInner = React.useMemo(
    () => k.planOutline(k.insetPlan(NAMEPLATE_PLAN, 1.5), 1.2, PROJECTION),
    [],
  );
  const nameplateTextPt = React.useMemo(
    () => k.iso([NAMEPLATE_PLAN.x + 5, NAMEPLATE_PLAN.y + 9, 1.3], PROJECTION),
    [],
  );

  // Dial Gauge Housing
  const dialPillar = React.useMemo(
    () => k.cylinder(DIAL_CX, DIAL_CY, 4.5, 0, DIAL_Z0, PROJECTION, 16),
    [],
  );
  const dialBody = React.useMemo(
    () => k.cylinder(DIAL_CX, DIAL_CY, DIAL_RADIUS, DIAL_Z0, DIAL_HEIGHT, PROJECTION, 36, 1.2),
    [],
  );
  const dialTicks = React.useMemo(() => {
    return k.radialTicks(
      DIAL_CX,
      DIAL_CY,
      DIAL_RADIUS - 3.5,
      24,
      6,
      DIAL_FACE_Z,
      [1.8, 3.2],
      PROJECTION,
      -Math.PI * 0.75,
      Math.PI * 1.5,
    );
  }, []);
  const dialBezelArc = React.useMemo(
    () => k.sideArc(DIAL_CX, DIAL_CY, DIAL_RADIUS - 0.8, DIAL_FACE_Z, PROJECTION, 24),
    [],
  );

  // Needle path
  const needleCenter = React.useMemo(
    () => k.iso([DIAL_CX, DIAL_CY, DIAL_FACE_Z + 0.4], PROJECTION),
    [],
  );
  const needleTipX = DIAL_CX + Math.cos(needleAngle) * (DIAL_RADIUS - 4);
  const needleTipY = DIAL_CY + Math.sin(needleAngle) * (DIAL_RADIUS - 4);
  const needleTip = React.useMemo(
    () => k.iso([needleTipX, needleTipY, DIAL_FACE_Z + 0.4], PROJECTION),
    [needleTipX, needleTipY],
  );

  // CRT Housing
  const crtBody = React.useMemo(
    () => k.slabOf(CRT_PLAN, CRT_Z0, CRT_HEIGHT, PROJECTION, 6, 1.4),
    [],
  );
  const crtBezel = React.useMemo(
    () => k.planOutline(k.insetPlan(CRT_PLAN, 3), CRT_Z0 + CRT_HEIGHT, PROJECTION),
    [],
  );
  const crtScreenPlan = React.useMemo(() => k.insetPlan(CRT_PLAN, 6), []);
  const crtScreenTop = React.useMemo(
    () => k.onTop(k.ringOf(crtScreenPlan, 4), CRT_Z0 + CRT_HEIGHT - 1, PROJECTION, true),
    [crtScreenPlan],
  );

  // Tape reels (Deck A and B)
  const spoolASpindle = React.useMemo(
    () => k.cylinder(SPOOL_A_CX, SPOOL_A_CY, 3.8, 0, 18, PROJECTION, 16),
    [],
  );
  const spoolAFlangeBottom = React.useMemo(
    () => k.cylinder(SPOOL_A_CX, SPOOL_A_CY, 34, 1.5, 1.2, PROJECTION, 32),
    [],
  );
  const spoolAFlangeTop = React.useMemo(
    () => k.cylinder(SPOOL_A_CX, SPOOL_A_CY, 34, 12, 1.2, PROJECTION, 32),
    [],
  );
  const spoolAKnurl = React.useMemo(
    () => k.knurl(SPOOL_A_CX, SPOOL_A_CY, 5.5, 13.2, 17, 12, PROJECTION, 0.4),
    [],
  );

  const spoolBSpindle = React.useMemo(
    () => k.cylinder(SPOOL_B_CX, SPOOL_B_CY, 3.8, 0, 18, PROJECTION, 16),
    [],
  );
  const spoolBFlangeBottom = React.useMemo(
    () => k.cylinder(SPOOL_B_CX, SPOOL_B_CY, 34, 1.5, 1.2, PROJECTION, 32),
    [],
  );
  const spoolBFlangeTop = React.useMemo(
    () => k.cylinder(SPOOL_B_CX, SPOOL_B_CY, 34, 12, 1.2, PROJECTION, 32),
    [],
  );
  const spoolBKnurl = React.useMemo(
    () => k.knurl(SPOOL_B_CX, SPOOL_B_CY, 5.5, 13.2, 17, 12, PROJECTION, 0.4),
    [],
  );

  // Dynamic tape solid cylinders based on progress
  const tapeCoilA = React.useMemo(
    () => k.cylinder(SPOOL_A_CX, SPOOL_A_CY, tapeRadiusA, 2.7, 9.3, PROJECTION, 28),
    [tapeRadiusA],
  );
  const tapeCoilB = React.useMemo(
    () => k.cylinder(SPOOL_B_CX, SPOOL_B_CY, tapeRadiusB, 2.7, 9.3, PROJECTION, 28),
    [tapeRadiusB],
  );

  // Linear guide rails
  const rail1 = React.useMemo(
    () => k.cylinder(RAIL_X_START, RAIL_Y1, 1.6, RAIL_Z, 0, PROJECTION),
    [],
  );
  const rail1Path = React.useMemo(
    () =>
      k.pathOf([
        k.iso([RAIL_X_START, RAIL_Y1, RAIL_Z], PROJECTION),
        k.iso([RAIL_X_END, RAIL_Y1, RAIL_Z], PROJECTION),
      ]),
    [],
  );
  const rail2Path = React.useMemo(
    () =>
      k.pathOf([
        k.iso([RAIL_X_START, RAIL_Y2, RAIL_Z], PROJECTION),
        k.iso([RAIL_X_END, RAIL_Y2, RAIL_Z], PROJECTION),
      ]),
    [],
  );

  // Rail End Brackets
  const endBracketL = React.useMemo(
    () =>
      k.slabOf(
        { x: RAIL_X_START - 4, y: RAIL_Y1 - 3, w: 4, d: RAIL_Y2 - RAIL_Y1 + 6, r: 1 },
        0,
        9,
        PROJECTION,
        3,
      ),
    [],
  );
  const endBracketR = React.useMemo(
    () =>
      k.slabOf(
        { x: RAIL_X_END, y: RAIL_Y1 - 3, w: 4, d: RAIL_Y2 - RAIL_Y1 + 6, r: 1 },
        0,
        9,
        PROJECTION,
        3,
      ),
    [],
  );

  // Moving Scanning Carriage Body
  const carriagePlan: k.Plan = React.useMemo(
    () => ({ x: carriageX - 10, y: RAIL_Y1 - 2, w: 20, d: RAIL_Y2 - RAIL_Y1 + 4, r: 2 }),
    [carriageX],
  );
  const carriageSolid = React.useMemo(
    () => k.slabOf(carriagePlan, RAIL_Z - 1.5, 7, PROJECTION, 4, 0.8),
    [carriagePlan],
  );
  const carriageLens = React.useMemo(
    () => k.cylinder(carriageX, (RAIL_Y1 + RAIL_Y2) / 2, 3.2, RAIL_Z + 5.5, 2.5, PROJECTION, 16),
    [carriageX],
  );
  const carriageLaserSpot = React.useMemo(
    () => k.iso([carriageX, (RAIL_Y1 + RAIL_Y2) / 2, RAIL_Z + 8], PROJECTION),
    [carriageX],
  );

  // Tape path ribbon (runs from Deck A -> Carriage Head -> Deck B)
  const tapeRibbon = React.useMemo(() => {
    const ptA = k.iso(
      [SPOOL_A_CX + tapeRadiusA * 0.7, SPOOL_A_CY + tapeRadiusA * 0.7, 7.5],
      PROJECTION,
    );
    const ptHead = k.iso([carriageX, (RAIL_Y1 + RAIL_Y2) / 2, 7.5], PROJECTION);
    const ptB = k.iso(
      [SPOOL_B_CX - tapeRadiusB * 0.7, SPOOL_B_CY + tapeRadiusB * 0.7, 7.5],
      PROJECTION,
    );
    return k.pathOf([ptA, ptHead, ptB]);
  }, [carriageX, tapeRadiusA, tapeRadiusB]);

  // CRT Phosphor lines (simulated tool call telemetry graph)
  const crtWave = React.useMemo(() => {
    const pts: k.Flat[] = [];
    const crtCenterX = CRT_PLAN.x + CRT_PLAN.w / 2;
    const crtCenterY = CRT_PLAN.y + CRT_PLAN.d / 2;
    const zBase = CRT_Z0 + CRT_HEIGHT - 0.8;
    for (let i = 0; i < 9; i++) {
      const offsetX = -18 + i * 4.5;
      const amplitude = Math.sin((i + activeStep * 2) * 1.3) * (step.confidence * 4 + 1);
      pts.push(k.iso([crtCenterX + offsetX, crtCenterY + amplitude, zBase], PROJECTION));
    }
    return k.pathOf(pts);
  }, [activeStep, step.confidence]);

  return (
    <div className="flight-recorder-wrap" data-theme="dark">
      {/* Plate Header Info */}
      <div className="flight-plate-meta">
        <div className="meta-left">
          <span className="meta-tag">FIG 01 {"// INSTRUMENT TF-01"}</span>
          <span className="meta-title">AGENT FLIGHT RECORDER & TELEMETRY RIG</span>
        </div>
        <div className="meta-right">
          <span
            className="meta-status-pill"
            data-level={
              step.confidence >= 0.9
                ? "verified"
                : step.confidence >= 0.3
                  ? "warning"
                  : "unverified"
            }
          >
            <span className="pill-dot" />
            {step.verification}
          </span>
        </div>
      </div>

      {/* Isometric Canvas */}
      <div className="flight-rig-viewport">
        {mounted ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 860 480"
            className="iso-svg flight-svg"
            role="img"
            aria-label="Interactive isometric model of the Quoli Agent Flight Recorder"
            suppressHydrationWarning
          >
            {/* Base Halo Shadow */}
            <path className="iso-halo" d={halo} />

            {/* Under-Base Feet */}
            {feetSolids.map((foot) => (
              <g key={foot.id} className="iso-solid">
                <Solid paths={foot.flange} tone="lo" />
                <Solid paths={foot.body} tone="mid" />
              </g>
            ))}

            {/* Main Chassis Base */}
            <Solid paths={baseSlab} tone="mid" crease="faint" />
            <Line d={baseGroove} tone="lo" />

            {/* Corner Screws */}
            {baseScrews.map((screw) => (
              <g key={screw.circle}>
                <Line d={screw.circle} tone="lo" />
                <circle
                  cx={screw.center[0]}
                  cy={screw.center[1]}
                  r={0.7}
                  className="iso-dot-item"
                />
              </g>
            ))}

            {/* Calibration Ruler Strip */}
            <Solid paths={rulerSlab} tone="lo" flat />
            <Line d={rulerTicks.minor} tone="lo" />
            <Line d={rulerTicks.major} tone="mid" />

            {/* Serial Plate */}
            <Solid paths={nameplateSlab} tone="mid" />
            <Line d={nameplateInner} tone="faint" />
            <text
              x={nameplateTextPt[0]}
              y={nameplateTextPt[1]}
              className="plate-engraved-text"
              fontSize="3.8"
              fill="var(--ink-muted, #73737a)"
              fontFamily="var(--mono)"
            >
              {"RIG TF-01 // AUDIT"}
            </text>

            {/* Dial Gauge Pillar & Housing */}
            <Solid paths={dialPillar} tone="lo" />
            <Solid paths={dialBody} tone="hi" />
            <Line d={dialTicks.minor} tone="lo" />
            <Line d={dialTicks.major} tone="mid" />
            <Line d={dialBezelArc} tone="faint" />

            {/* Dial Needle */}
            <Wire from={needleCenter} to={needleTip} tone="lit" size={1.6} />

            {/* CRT Terminal Enclosure */}
            <Solid paths={crtBody} tone="hi" />
            <Line d={crtBezel} tone="lo" />
            <path d={crtScreenTop} fill="#0d1117" stroke="none" />

            {/* CRT Screen Scanlines & Phosphor Trace */}
            <Line d={crtWave} tone={step.confidence >= 0.9 ? "green" : "lit"} flow />

            {/* Spool A (Raw Tape Reel) */}
            <Solid paths={spoolASpindle} tone="lo" />
            <Solid paths={spoolAFlangeBottom} tone="lo" />
            <Solid paths={tapeCoilA} tone="mid" />
            <Solid paths={spoolAFlangeTop} tone="lo" />
            <Line d={spoolAKnurl} tone="mid" />

            {/* Spool B (Sealed Audit Ledger Reel) */}
            <Solid paths={spoolBSpindle} tone="lo" />
            <Solid paths={spoolBFlangeBottom} tone="lo" />
            <Solid paths={tapeCoilB} tone="mid" />
            <Solid paths={spoolBFlangeTop} tone="lo" />
            <Line d={spoolBKnurl} tone="mid" />

            {/* Dynamic Tape Path Ribbon */}
            <path
              d={tapeRibbon}
              fill="none"
              stroke="var(--accent, #a78bfa)"
              strokeWidth="1.8"
              strokeDasharray="4 2"
            />

            {/* Linear Guide Rails */}
            <Line d={rail1Path} tone="hi" />
            <Line d={rail2Path} tone="hi" />
            <Solid paths={endBracketL} tone="mid" />
            <Solid paths={endBracketR} tone="mid" />

            {/* Moving Optical Scanner Carriage */}
            <Solid paths={carriageSolid} tone="hi" lit />
            <Solid paths={carriageLens} tone="mid" />
            {/* Laser targeting dot */}
            <circle
              cx={carriageLaserSpot[0]}
              cy={carriageLaserSpot[1]}
              r={1.8}
              fill={step.confidence >= 0.9 ? "#10b981" : "#f59e0b"}
              className="pulse-laser"
            />
          </svg>
        ) : (
          <div className="flight-rig-placeholder" />
        )}

        {/* Live CRT HUD Overlay (pixel badge) */}
        <div className="crt-hud-badge">
          <div className="hud-line">
            <span className="hud-label">TRACE</span>
            <span className="hud-val">{step.hash}</span>
          </div>
          <div className="hud-line">
            <span className="hud-label">TARGET</span>
            <span className="hud-val">{step.tool}</span>
          </div>
          <div className="hud-line">
            <span className="hud-label">DIFF</span>
            <span className="hud-val diff-val">{step.diffSummary}</span>
          </div>
        </div>
      </div>

      {/* Interactive Step Controller Strip */}
      <div className="flight-controller">
        <div className="controller-steps" role="tablist" aria-label="Flight recorder states">
          {FLIGHT_STEPS.map((s, idx) => {
            const isCurrent = idx === activeStep;
            return (
              <button
                type="button"
                key={s.id}
                role="tab"
                aria-selected={isCurrent}
                className={`step-btn ${isCurrent ? "active" : ""}`}
                onClick={() => {
                  setIsPlaying(false);
                  setActiveStep(idx);
                }}
              >
                <span className="step-num">{s.label}</span>
                <span className="step-stage">{s.stage}</span>
              </button>
            );
          })}
        </div>

        <div className="controller-meta">
          <button
            type="button"
            className="playback-toggle"
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? "Pause simulation" : "Play simulation"}
          >
            {isPlaying ? "PAUSE SIM" : "AUTO-TOUR"}
          </button>
          <div className="readout-bar">
            <span className="readout-label">EVIDENCE BASIS:</span>
            <span className="readout-text">{step.description}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
