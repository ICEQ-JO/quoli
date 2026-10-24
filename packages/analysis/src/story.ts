import { createHash } from "node:crypto";
import type { StoredEvent, SubagentLink } from "@traceframe/schema";
import type { Scene, SceneEdge, SceneNode } from "@traceframe/schema/scene";
import {
  MAX_STORY_CLAIMS,
  type Story,
  type StoryClaim,
  type StoryClaimKind,
  storySchema,
} from "@traceframe/schema/story";
import { ACTIVITY_RULE, activity } from "./activity";
import { CHECK_RULE, verification } from "./checks";
import type { MappableFile } from "./map";

/**
 * Deterministic Story projection (V20).
 *
 * Turns, declarations, subagent links and gaps come from the recorded activity
 * projection; checks come from the recorded-check projection; captured files
 * are supplied by the caller from an explicit snapshot comparison. The story
 * reproduces no prompt or decision text and never fills a missing rationale.
 */

export const STORY_RULE = "session-story/v1";
export const DEFAULT_CLAIM_CAP = 100;
/** The scene contract's own v1 caps. */
export const STORY_SCENE_CAPS = { nodes: 500, edges: 1_000 } as const;

const SCENE_UNCERTAINTY =
  "A story restates retained observations only: declared activity, tool calls and results, subagent identities, captured file changes, recorded checks and known gaps. It does not reproduce prompt or decision text, infer intent or hidden reasoning, establish authorship, coverage or feature correctness, or claim that an absent observation never happened. A check label may repeat the recorded command as inert text.";

type ClaimSeed = { claim: StoryClaim; requires: string[] };

type GapLike = {
  id: string;
  kind: string;
  evidenceIds: string[];
  rule: string;
  uncertainty: string;
  basis?: SceneNode["basis"];
};

type ToolRecord = {
  call: StoredEvent;
  results: StoredEvent[];
  nodeId: string;
  status: string;
};

const GAP_LABELS: Record<string, string> = {
  missing_parent: "Parent activity not retained",
  missing_child: "Child activity not retained",
  missing_end: "Session end not retained",
  missing_rationale: "Decision not recorded",
  missing_result: "Tool result not retained",
  capture_disabled: "Capture disabled",
  late_arrival: "Late observation recorded",
  unsupported_source: "Unsupported source",
};

function hash(prefix: string, parts: unknown[]): string {
  return `${prefix}-${createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 24)}`;
}

function ordered(events: StoredEvent[]): StoredEvent[] {
  return [...events].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
}

function toolLabel(event: StoredEvent): string {
  if (event.payload.kind !== "tool_call") return "Tool call";
  return (event.schemaVersion === 2 ? event.tool?.rawName : null) ?? event.payload.toolName;
}

function resultStatus(event: StoredEvent): string {
  return event.payload.kind === "tool_result" ? event.payload.status : "unknown";
}

/** Scene labels are capped at 300 chars; an ellipsis shows the text was cut. */
function clip(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

/**
 * One bounded scene plus its cited narrative for a single session.
 *
 * Requires at least one retained observation. `beforeId`/`afterId` are the
 * capture pair the caller compared; with no capture, `afterId` falls back to the
 * last retained observation and the scene window says so.
 */
export function story(input: {
  projectId: string;
  sessionId: string;
  events: StoredEvent[];
  files?: MappableFile[];
  omittedFiles?: number;
  beforeId?: string | null;
  afterId?: string | null;
  claims?: number;
}): Story {
  const claimCap = Math.max(1, Math.min(input.claims ?? DEFAULT_CLAIM_CAP, MAX_STORY_CLAIMS));
  const rows = ordered(
    input.events.filter(
      (event) => event.projectId === input.projectId && event.sessionId === input.sessionId,
    ),
  );
  if (rows.length === 0)
    throw new Error("A story needs at least one retained observation for its session.");
  const sequence = new Map(rows.map((event) => [event.id, event.sequence]));
  // All retained project events let the activity projection resolve linked
  // sessions; only this session's rows become nodes and checks.
  const view = activity(input.events.filter((event) => event.projectId === input.projectId));
  const checks = verification(rows);
  const checkStates = new Map<string, Set<string>>();
  for (const check of checks.checks) {
    const states = checkStates.get(check.callId) ?? new Set<string>();
    states.add(check.state);
    checkStates.set(check.callId, states);
  }
  const beforeId = input.beforeId ?? null;
  const afterId = input.afterId ?? rows[rows.length - 1].id;
  const suppliedFiles = (input.files ?? []).filter((file) => file.status !== "unchanged");
  const files =
    beforeId !== null && input.afterId != null
      ? suppliedFiles.filter((file) => file.evidenceIds.length > 0)
      : [];
  let omittedNodes = (input.omittedFiles ?? 0) + (suppliedFiles.length - files.length);
  let omittedDeclarations = 0;
  let missingRationaleTurns = 0;

  const nodes: SceneNode[] = [];
  const edges: SceneEdge[] = [];
  const seeds: ClaimSeed[] = [];

  const turnOrder = (ids: string[]): number =>
    ids.reduce(
      (low, id) => Math.min(low, sequence.get(id) ?? Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );
  const turns = view.turns
    .filter((turn) => turn.sessionId === input.sessionId)
    .sort((a, b) => turnOrder(a.eventIds) - turnOrder(b.eventIds) || a.id.localeCompare(b.id));
  const turnNodeByTurn = new Map<string, string>();

  const claim = (
    kind: StoryClaimKind,
    key: unknown[],
    text: string,
    evidenceIds: string[],
    uncertainty: string,
    requires: string[] = [],
    basis: StoryClaim["basis"] = "derived",
  ): ClaimSeed => ({
    claim: {
      id: hash("claim", [kind, ...key]),
      kind,
      text,
      basis,
      rule: STORY_RULE,
      evidenceIds: [...new Set(evidenceIds)].slice(0, 50),
      uncertainty,
    },
    requires,
  });

  const pushPrompt = (event: StoredEvent): string => {
    const state =
      event.payload.kind === "prompt" ? event.payload.content.state : ("unavailable" as const);
    const node: SceneNode = {
      id: hash("n-prompt", [event.id]),
      kind: "prompt",
      label: state === "present" ? "Prompt recorded" : `Prompt (${state})`,
      status: state,
      ref: event.id,
      basis: "recorded",
      rule: STORY_RULE,
      evidenceIds: [event.id],
      uncertainty:
        "A request observation was captured. Its text is not reproduced here, and it does not establish how the work was understood.",
    };
    nodes.push(node);
    return node.id;
  };

  const pushTool = (call: StoredEvent, results: StoredEvent[]): ToolRecord => {
    const statuses = [...new Set(results.map(resultStatus))];
    const exitCodes = new Set(
      results.flatMap((event) =>
        event.payload.kind === "tool_result" && event.payload.exitCode !== null
          ? [event.payload.exitCode]
          : [],
      ),
    );
    const status =
      results.length === 0
        ? "no_result"
        : statuses.length > 1 || exitCodes.size > 1 || (checkStates.get(call.id)?.size ?? 0) > 1
          ? "conflicting"
          : (statuses[0] ?? "unknown");
    const node: SceneNode = {
      id: hash("n-tool", [call.id]),
      kind: "tool",
      label: toolLabel(call),
      status,
      ref: call.id,
      basis: "recorded",
      rule: STORY_RULE,
      evidenceIds: [call.id, ...results.map((result) => result.id)].slice(0, 50),
      uncertainty:
        status === "no_result"
          ? "The call was recorded without a result. Whether it succeeded is unknown."
          : status === "conflicting"
            ? "Two or more recorded results disagree for this tool call. No outcome is selected."
            : "A reported tool result does not establish what the tool changed or that the change is correct.",
    };
    nodes.push(node);
    if (status === "conflicting")
      seeds.push(
        claim(
          "conflict",
          [call.id],
          "Two or more recorded results disagree for the same tool call; neither is reported as the outcome.",
          [call.id, ...results.map((result) => result.id)],
          "The retained observations conflict. Choosing one would invent certainty the evidence does not have.",
          [node.id],
        ),
      );
    return { call, results, nodeId: node.id, status };
  };

  const pushGap = (gap: GapLike): string => {
    const node: SceneNode = {
      id: hash("n-gap", [gap.id]),
      kind: "gap",
      label: GAP_LABELS[gap.kind] ?? "Observation not retained",
      status: gap.kind,
      ref: gap.id,
      basis: gap.basis ?? "derived",
      rule: gap.rule,
      evidenceIds: gap.evidenceIds.slice(0, 50),
      uncertainty: gap.uncertainty,
    };
    nodes.push(node);
    return node.id;
  };

  const pushLink = (link: SubagentLink): string => {
    const isParent = link.parent.sessionId === input.sessionId;
    const other = isParent ? link.child.sessionId : link.parent.sessionId;
    const node: SceneNode = {
      id: hash("n-subagent", [link.id]),
      kind: "subagent",
      label: `${isParent ? "Subagent" : "Parent"} session ${other}`,
      status: link.relation,
      ref: link.id,
      basis: "derived",
      rule: ACTIVITY_RULE,
      evidenceIds: link.evidenceIds.slice(0, 50),
      uncertainty:
        "The source declared the linked session identity. The link does not establish what either side did or why.",
    };
    nodes.push(node);
    return node.id;
  };

  const resultByCall = new Map<string, StoredEvent[]>();
  for (const event of rows) {
    if (event.payload.kind !== "tool_result" || event.toolId === null) continue;
    resultByCall.set(event.toolId, [...(resultByCall.get(event.toolId) ?? []), event]);
  }
  const attributed = new Set(turns.flatMap((turn) => turn.eventIds));

  for (const turn of turns) {
    const turnNode: SceneNode = {
      id: hash("n-turn", [turn.id]),
      kind: "turn",
      label: `Turn ${turn.turnId}`,
      status: turn.ended ? "ended" : "open",
      ref: turn.turnId,
      basis: "derived",
      rule: ACTIVITY_RULE,
      evidenceIds: turn.evidenceIds.slice(0, 50),
      uncertainty:
        "The turn groups observations that carry the same recorded turn identity. It does not establish intent, timing or causality.",
    };
    nodes.push(turnNode);
    turnNodeByTurn.set(turn.turnId, turnNode.id);
    const turnEventIds = new Set(turn.eventIds);

    const prompts = rows.filter(
      (event) => turnEventIds.has(event.id) && event.payload.kind === "prompt",
    );
    const promptNodes = prompts.map((event) => {
      const nodeId = pushPrompt(event);
      edges.push({
        id: hash("e-prompted", [nodeId, turnNode.id]),
        kind: "prompted",
        from: nodeId,
        to: turnNode.id,
        basis: "derived",
        rule: STORY_RULE,
        evidenceIds: [event.id],
        uncertainty:
          "The request and turn share a recorded turn identity. Shared identity does not establish that the turn followed the request.",
      });
      return nodeId;
    });
    if (promptNodes.length > 0)
      seeds.push(
        claim(
          "request",
          [turn.turnId],
          `${promptNodes.length} request observation${promptNodes.length === 1 ? " was" : "s were"} recorded for this turn.`,
          prompts.map((event) => event.id),
          "A recorded request does not establish what was asked, whether it was followed, or what it caused.",
          promptNodes,
          "recorded",
        ),
      );

    const decisions = turn.declarations.filter((item) => item.kind === "decision");
    omittedDeclarations += turn.declarations.length - decisions.length;
    if (decisions.length > 0) {
      const decisionNodes = decisions.map((item) => {
        const node: SceneNode = {
          id: hash("n-decision", [item.eventId]),
          kind: "decision",
          label: "Declared decision",
          status: item.state,
          ref: item.eventId,
          basis: "recorded",
          rule: STORY_RULE,
          evidenceIds: [item.eventId],
          uncertainty:
            "The source declared a decision. Its text is not reproduced, and a declaration does not establish that the decision was carried out.",
        };
        nodes.push(node);
        edges.push({
          id: hash("e-declared", [turnNode.id, node.id]),
          kind: "declared",
          from: turnNode.id,
          to: node.id,
          basis: "derived",
          rule: STORY_RULE,
          evidenceIds: [item.eventId],
          uncertainty:
            "The declaration carries the turn identity. That association does not establish that the turn followed the decision.",
        });
        return node.id;
      });
      seeds.push(
        claim(
          "declared",
          [turn.turnId],
          `${decisionNodes.length} decision declaration${decisionNodes.length === 1 ? " was" : "s were"} retained for this turn.`,
          decisions.map((item) => item.eventId),
          "A declaration records what the source said, not the reason, and does not establish that it was followed.",
          decisionNodes,
          "recorded",
        ),
      );
    } else {
      missingRationaleTurns += 1;
      const gapNode = pushGap({
        id: hash("gap", ["missing_rationale", turn.id]),
        kind: "missing_rationale",
        evidenceIds: turn.evidenceIds,
        rule: STORY_RULE,
        uncertainty:
          "No decision declaration was retained for this turn, so the reason for the work stays unknown. Absence in retained evidence is not proof that no decision was made.",
      });
      seeds.push(
        claim(
          "unknown_rationale",
          [turn.id],
          "No decision was recorded for this turn, so the reason for the work stays unknown.",
          turn.evidenceIds,
          "Absence in retained evidence is not proof that no decision was made. The reason is not inferred from the request or the change.",
          [gapNode],
        ),
      );
    }

    const toolRecords: ToolRecord[] = [];
    for (const call of rows) {
      if (!turnEventIds.has(call.id) || call.payload.kind !== "tool_call") continue;
      const record = pushTool(
        call,
        call.toolId === null ? [] : (resultByCall.get(call.toolId) ?? []),
      );
      toolRecords.push(record);
      edges.push({
        id: hash("e-invoked", [turnNode.id, record.nodeId]),
        kind: "invoked",
        from: turnNode.id,
        to: record.nodeId,
        basis: "derived",
        rule: STORY_RULE,
        evidenceIds: [call.id],
        uncertainty:
          "The call carries the turn identity. That association does not establish who invoked the tool or what it changed.",
      });
    }
    if (toolRecords.length > 0) {
      const missing = toolRecords.filter((record) => record.results.length === 0).length;
      seeds.push(
        claim(
          "tool",
          [turn.turnId],
          `${toolRecords.length} tool call${toolRecords.length === 1 ? " was" : "s were"} recorded in this turn${missing > 0 ? `; ${missing} had no recorded result` : ""}.`,
          toolRecords.map((record) => record.call.id),
          "A recorded tool call does not establish what it changed. A missing result leaves the outcome unknown.",
          toolRecords.map((record) => record.nodeId),
          "recorded",
        ),
      );
    }
  }

  for (const link of view.subagents) {
    const isParent = link.relation === "spawned";
    // Each session reports only the link its own observations declared.
    if (
      isParent
        ? link.parent.sessionId !== input.sessionId
        : link.child.sessionId !== input.sessionId
    )
      continue;
    const nodeId = pushLink(link);
    const turnNodeId = turnNodeByTurn.get(
      (isParent ? link.parent.turnId : link.child.turnId) ?? "",
    );
    if (link.relation === "spawned" && turnNodeId)
      edges.push({
        id: hash("e-spawned", [turnNodeId, nodeId]),
        kind: "spawned",
        from: turnNodeId,
        to: nodeId,
        basis: "derived",
        rule: ACTIVITY_RULE,
        evidenceIds: link.evidenceIds.slice(0, 50),
        uncertainty:
          "The parent observation declared a child session identity. It does not establish what the child did.",
      });
    seeds.push(
      claim(
        "subagent",
        [link.id],
        isParent
          ? "This session declared a child session."
          : "This session declared a parent session.",
        link.evidenceIds,
        "The declared identity links two sessions. It does not establish delegation of work, ordering of events or authorship.",
        [nodeId],
        "recorded",
      ),
    );
  }

  for (const gap of view.gaps) {
    if (gap.sessionId !== input.sessionId) continue;
    const nodeId = pushGap(gap);
    seeds.push(
      claim(
        "gap",
        [gap.id],
        gap.kind === "missing_parent"
          ? "The declared parent activity is not retained."
          : gap.kind === "missing_child"
            ? "The declared child activity is not retained."
            : "No session end was retained for this session.",
        gap.evidenceIds,
        `${gap.uncertainty} The gap is reported, not filled.`.slice(0, 1000),
        [nodeId],
      ),
    );
  }

  for (const event of rows) {
    if (event.payload.kind === "gap") {
      const nodeId = pushGap({
        id: event.id,
        kind: event.payload.reason,
        evidenceIds: [event.id],
        rule: STORY_RULE,
        basis: "recorded",
        uncertainty: "The source reported a capture gap. Missing activity is not reconstructed.",
      });
      seeds.push(
        claim(
          "gap",
          [event.id],
          `The source reported a ${event.payload.reason.replaceAll("_", " ")} gap.`,
          [event.id],
          "A reported gap does not establish what the missing activity contained.",
          [nodeId],
          "recorded",
        ),
      );
    }
    if (attributed.has(event.id) || event.payload.kind !== "prompt") continue;
    const nodeId = pushPrompt(event);
    seeds.push(
      claim(
        "request",
        ["loose", event.id],
        "A request observation was recorded outside any declared turn.",
        [event.id],
        "No turn identity was recorded. The request cannot be placed in a sequence.",
        [nodeId],
        "recorded",
      ),
    );
  }
  for (const call of rows) {
    if (attributed.has(call.id) || call.payload.kind !== "tool_call") continue;
    const record = pushTool(
      call,
      call.toolId === null ? [] : (resultByCall.get(call.toolId) ?? []),
    );
    seeds.push(
      claim(
        "tool",
        ["loose", call.id],
        "A tool call was recorded outside any declared turn.",
        [call.id],
        "No turn identity was recorded. The call cannot be placed in a sequence and its result is not attributed to a turn.",
        [record.nodeId],
        "recorded",
      ),
    );
  }

  for (const file of files) {
    nodes.push({
      id: hash("n-file", [file.id]),
      kind: "file",
      label: clip(file.path),
      status: file.status,
      ref: file.id,
      basis: "derived",
      rule: STORY_RULE,
      evidenceIds: file.evidenceIds.slice(0, 50),
      uncertainty:
        file.uncertainty ??
        "The comparison records this path's status. It does not establish authorship, intent or feature correctness.",
    });
  }
  if (files.length > 0)
    seeds.push(
      claim(
        "files",
        [input.sessionId],
        `${files.length} path observation${files.length === 1 ? " was" : "s were"} retained from the supplied comparison.`,
        files.flatMap((file) => file.evidenceIds),
        "Comparison observations may be unavailable or uncertain. They do not establish who changed a path or whether a change is correct.",
        files.map((file) => hash("n-file", [file.id])),
      ),
    );

  const checkNodes = new Map<string, string>();
  for (const check of checks.checks) {
    const node: SceneNode = {
      id: hash("n-check", [check.id]),
      kind: "check",
      label: clip(check.command ?? "Command content disabled"),
      status: check.state,
      ref: check.id,
      basis: "derived",
      rule: CHECK_RULE,
      evidenceIds: check.evidenceIds.slice(0, 50),
      uncertainty: check.uncertainty,
    };
    nodes.push(node);
    checkNodes.set(check.id, node.id);
  }
  if (checks.checks.length > 0)
    seeds.push(
      claim(
        "checks",
        [input.sessionId],
        `${checks.checks.length} recorded command observation${checks.checks.length === 1 ? " was" : "s were"} projected.`,
        checks.checks.flatMap((check) => check.evidenceIds),
        "A recorded command result does not establish that it covered the captured changes or that the feature works.",
        checks.checks.map((check) => checkNodes.get(check.id) ?? ""),
      ),
    );
  const cappedNodes = nodes.slice(0, STORY_SCENE_CAPS.nodes);
  const kept = new Set(cappedNodes.map((node) => node.id));
  const cappedEdges = edges
    .filter((edge) => kept.has(edge.from) && kept.has(edge.to))
    .slice(0, STORY_SCENE_CAPS.edges);
  const eligible = seeds.filter((seed) => seed.requires.every((id) => kept.has(id)));
  const claims = eligible.slice(0, claimCap).map((seed) => seed.claim);

  omittedNodes += nodes.length - cappedNodes.length + omittedDeclarations;
  const sceneEvidence = [
    ...new Set([
      ...cappedNodes.flatMap((node) => node.evidenceIds),
      ...cappedEdges.flatMap((edge) => edge.evidenceIds),
    ]),
  ].slice(0, 200);
  const omissions: string[] = [];
  if (missingRationaleTurns > 0)
    omissions.push(
      `${missingRationaleTurns} turn${missingRationaleTurns === 1 ? "" : "s"} recorded no decision, so the reason stays unknown.`,
    );
  if (omittedDeclarations > 0)
    omissions.push(
      `${omittedDeclarations} declared plan, approval or correction observation${omittedDeclarations === 1 ? " has" : "s have"} no v1 node kind and ${omittedDeclarations === 1 ? "is" : "are"} counted as omitted.`,
    );
  if (beforeId === null)
    omissions.push("No baseline capture was supplied, so no captured file change is claimed.");
  if (input.afterId == null)
    omissions.push(
      "No capture bounds this scene; the window's after value names the last retained observation, not a snapshot.",
    );
  if (cappedNodes.length < nodes.length || cappedEdges.length < edges.length)
    omissions.push(
      `${nodes.length - cappedNodes.length} node and ${edges.length - cappedEdges.length} edge observations are omitted by the 500-node/1000-edge cap; claims for omitted nodes are dropped.`,
    );
  if ((input.omittedFiles ?? 0) > 0)
    omissions.push(
      `${input.omittedFiles} captured change observation${input.omittedFiles === 1 ? " was" : "s were"} omitted by the caller's comparison.`,
    );
  const scene: Scene = {
    version: 1,
    projectId: input.projectId,
    sessionId: input.sessionId,
    rule: STORY_RULE,
    uncertainty: `${SCENE_UNCERTAINTY}${omissions.length > 0 ? ` ${omissions.join(" ")}` : ""}`,
    nodes: cappedNodes,
    edges: cappedEdges,
    omittedNodes,
    omittedEdges: edges.length - cappedEdges.length,
    caps: { nodes: STORY_SCENE_CAPS.nodes, edges: STORY_SCENE_CAPS.edges },
    evidenceIds: sceneEvidence,
    window: { before: beforeId, after: afterId, baselineMissing: beforeId === null },
  };
  return storySchema.parse({
    version: 1,
    projectId: input.projectId,
    sessionId: input.sessionId,
    rule: STORY_RULE,
    uncertainty: `${SCENE_UNCERTAINTY} The narrative states only what the scene and its cited observations support; a claim is dropped when its node is capped.`,
    scene,
    claims,
    omittedClaims: eligible.length - claims.length,
    caps: { claims: claimCap },
  });
}
