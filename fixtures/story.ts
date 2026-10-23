import type { MappableFile } from "../packages/analysis/src/map";
import {
  type Content,
  eventSchema,
  type StoredEvent,
  type V2NormalizedEvent,
} from "../packages/schema/src/index";

// Synthetic multi-agent fixture for the Story projection. No private session,
// credential, real prompt or repository path is used. Captured text exists only
// to prove the story does not reproduce it.

const content = (
  text: string | null,
  categories: Content["categories"],
  state: Content["state"] = "present",
): Content => ({ text, state, originalBytes: null, categories });

const quiet = {
  turnId: null,
  parentSessionId: null,
  parentTurnId: null,
  childSessionId: null,
  childTurnId: null,
};

function v2(overrides: { id: string } & Record<string, unknown>): V2NormalizedEvent {
  return eventSchema.parse({
    schemaVersion: 2,
    deliveryId: `${overrides.id}-delivery`,
    projectId: "story-project",
    sessionId: "story-root",
    source: "synthetic_harness",
    sourceVersion: "1.0.0",
    adapterId: "fixture-story",
    adapterVersion: "1.0.0",
    sourceLocator: "fixtures/story.ts",
    producerId: "fixture-story",
    promptId: null,
    toolId: null,
    requestId: null,
    sourceTime: null,
    sourceSequence: null,
    policyVersion: 1,
    tool: null,
    activity: quiet,
    fieldCapabilities: {
      content: "available",
      plan: "available",
      decision: "available",
      approval: "available",
      correction: "available",
    },
    declared: { plan: null, decision: null, approval: null, correction: null },
    ...overrides,
  }) as V2NormalizedEvent;
}

/** Interleaved parent and child activity; sequence order is the array order. */
export function storyEvents(): StoredEvent[] {
  const rootTurn = { ...quiet, turnId: "root-turn" };
  const childTurn = {
    ...quiet,
    turnId: "child-turn",
    parentSessionId: "story-root",
    parentTurnId: "root-turn",
  };
  const events = [
    v2({
      id: "story-root-prompt",
      activity: rootTurn,
      payload: {
        kind: "prompt",
        content: content("Synthetic request: make the cache path faster.", ["prompt"]),
      },
    }),
    v2({
      id: "story-child-prompt",
      sessionId: "story-child",
      activity: childTurn,
      payload: {
        kind: "prompt",
        content: content("Synthetic child request: inspect the cache path.", ["prompt"]),
      },
    }),
    v2({
      id: "story-root-decision",
      activity: rootTurn,
      declared: {
        plan: null,
        decision: content("Synthetic decision text: keep the file cache.", ["prompt"]),
        approval: null,
        correction: null,
      },
      payload: { kind: "session_start", content: content(null, ["prompt"], "unavailable") },
    }),
    v2({
      id: "story-root-call",
      toolId: "root-tool",
      tool: { rawName: "workspace.apply_patch", category: "Other" },
      activity: rootTurn,
      payload: {
        kind: "tool_call",
        toolName: "Bash",
        content: content("Synthetic patch", ["tool"]),
        path: "src/cache.ts",
      },
    }),
    v2({
      id: "story-child-call",
      sessionId: "story-child",
      toolId: "child-tool",
      tool: { rawName: "file.read", category: "Read" },
      activity: childTurn,
      payload: {
        kind: "tool_call",
        toolName: "Read",
        content: content("Synthetic read", ["tool"]),
        path: "src/cache.ts",
      },
    }),
    v2({
      id: "story-root-result",
      toolId: "root-tool",
      tool: { rawName: "workspace.apply_patch", category: "Other" },
      activity: rootTurn,
      payload: {
        kind: "tool_result",
        toolName: "Bash",
        content: content("Tests: 2 passed", ["tool"]),
        exitCode: 0,
        status: "success",
      },
    }),
    v2({
      id: "story-root-spawn",
      activity: { ...rootTurn, childSessionId: "story-child", childTurnId: "child-turn" },
      payload: { kind: "session_start", content: content(null, ["prompt"], "unavailable") },
    }),
    v2({
      id: "story-child-end",
      sessionId: "story-child",
      payload: { kind: "session_end", reason: "completed" },
    }),
    v2({ id: "story-root-end", payload: { kind: "session_end", reason: "completed" } }),
  ];
  return events.map((event, index) => ({
    ...event,
    sequence: index + 1,
    receivedAt: "2026-10-23T10:00:00.000Z",
  }));
}

/** The same tool call observed twice with disagreeing results. */
export function conflictingStoryEvents(): StoredEvent[] {
  const events = storyEvents();
  const extra = v2({
    id: "story-root-result-2",
    toolId: "root-tool",
    tool: { rawName: "workspace.apply_patch", category: "Other" },
    activity: { ...quiet, turnId: "root-turn" },
    payload: {
      kind: "tool_result",
      toolName: "Bash",
      content: content("Tests: 1 failed", ["tool"]),
      exitCode: 1,
      status: "failure",
    },
  });
  return [
    ...events,
    { ...extra, sequence: events.length + 1, receivedAt: "2026-10-23T10:00:00.000Z" },
  ];
}

export const storyFiles: MappableFile[] = [
  {
    id: "change-cache",
    path: "src/cache.ts",
    status: "modified",
    uncertainty: null,
    evidenceIds: ["story-obs-before", "story-obs-after"],
  },
];
