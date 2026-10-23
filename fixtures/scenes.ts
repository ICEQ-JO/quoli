import type { ChangeMap } from "../packages/schema/src/map";
import type { Scene } from "../packages/schema/src/scene";

// Synthetic fixtures for the scene contract: one valid legacy change map to
// convert, and one scene that exercises every vocabulary kind. No private
// session, credential or real repository path is used.

const evidence = ["obs-before", "obs-after", "check-1", "ref-1", "ref-2"];

export const legacyMap: ChangeMap = {
  nodes: [
    {
      id: "f-src-app",
      kind: "file",
      label: "src/app.ts",
      status: "modified",
      ref: "change-1",
      evidenceIds: ["obs-before", "obs-after"],
      uncertainty: null,
    },
    {
      id: "f-src-lib",
      kind: "file",
      label: "src/lib.ts",
      status: "added",
      ref: "change-2",
      evidenceIds: ["obs-before", "obs-after"],
      uncertainty: "The file was added between the two captures.",
    },
    {
      id: "c-tests",
      kind: "check",
      label: "pnpm test",
      status: "passed",
      ref: "check-1",
      evidenceIds: ["check-1"],
      uncertainty: "A successful command does not establish feature correctness.",
    },
  ],
  edges: [
    {
      id: "e-prior",
      from: "f-src-app",
      to: "c-tests",
      basis: "derived",
      rule: "prior-file-reference/v1",
      position: "before",
      evidenceIds: ["ref-1", "check-1"],
      uncertainty: "The path was referenced before the recorded check.",
    },
    {
      id: "e-post",
      from: "f-src-lib",
      to: "c-tests",
      basis: "derived",
      rule: "post-check-file-reference/v1",
      position: "after",
      evidenceIds: ["ref-2", "check-1"],
      uncertainty: "The path was referenced after the recorded check.",
    },
  ],
  omittedNodes: 0,
  omittedEdges: 0,
  caps: { nodes: 100, edges: 200 },
  window: { before: "snap-before", after: "snap-after", baselineMissing: false },
  evidenceIds: evidence,
  rule: "captured-change-map/v1",
  uncertainty:
    "Captured changes and recorded checks are joined by explicit references only. The map does not establish authorship, coverage or feature correctness.",
};

const node = (id: string, kind: Scene["nodes"][number]["kind"], label: string) => ({
  id,
  kind,
  label,
  status: null,
  ref: null,
  basis: "recorded" as const,
  rule: "fixture-scene/v1",
  evidenceIds: ["obs-before"],
  uncertainty: "Synthetic fixture node.",
});

const edge = (id: string, kind: Scene["edges"][number]["kind"], from: string, to: string) => ({
  id,
  kind,
  from,
  to,
  basis: "derived" as const,
  rule: "fixture-scene/v1",
  evidenceIds: ["obs-after"],
  uncertainty: "Synthetic fixture edge.",
});

export const vocabularyScene: Scene = {
  version: 1,
  projectId: "demo-quoli",
  sessionId: "session-fixture",
  rule: "fixture-scene/v1",
  uncertainty: "Synthetic fixture scene that exercises every vocabulary kind.",
  nodes: [
    node("n-turn", "turn", "Turn 1"),
    node("n-prompt", "prompt", "Prompt"),
    node("n-decision", "decision", "Declared decision"),
    node("n-subagent", "subagent", "Subagent"),
    node("n-tool", "tool", "Bash"),
    node("n-file", "file", "src/app.ts"),
    node("n-symbol", "symbol", "handler"),
    node("n-hunk", "hunk", "Hunk 1"),
    node("n-check", "check", "pnpm test"),
    node("n-gap", "gap", "Missing result"),
    node("n-cost", "cost", "Request cost"),
    node("n-capability", "capability", "Prompt capture"),
  ],
  edges: [
    edge("e-prompted", "prompted", "n-prompt", "n-turn"),
    edge("e-declared", "declared", "n-turn", "n-decision"),
    edge("e-spawned", "spawned", "n-turn", "n-subagent"),
    edge("e-invoked", "invoked", "n-subagent", "n-tool"),
    edge("e-touched", "touched", "n-tool", "n-file"),
    edge("e-changed", "changed", "n-file", "n-hunk"),
    edge("e-verified", "verified", "n-check", "n-file"),
    edge("e-failed", "failed", "n-check", "n-gap"),
    edge("e-cost", "cost_of", "n-cost", "n-turn"),
    edge("e-used", "used", "n-tool", "n-capability"),
  ],
  omittedNodes: 0,
  omittedEdges: 0,
  caps: { nodes: 100, edges: 200 },
  evidenceIds: ["obs-before", "obs-after"],
  window: { before: "snap-before", after: "snap-after", baselineMissing: false },
};
