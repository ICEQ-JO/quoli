import { createHash } from "node:crypto";
import type { ActivityGap, ActivityView, StoredEvent, SubagentLink } from "@traceframe/schema";

export const ACTIVITY_RULE = "explicit-activity-identities/v1";
const UNCERTAINTY =
  "Turns, declarations and subagent links use only recorded v2 identities. They do not infer intent, timing, or a relationship from text.";

type Ref = { sessionId: string; turnId: string | null };
type Link = Omit<SubagentLink, "id" | "evidenceIds"> & { evidenceIds: string[] };

function hash(prefix: string, parts: unknown[]): string {
  return `${prefix}-${createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 24)}`;
}
function compareEvents(a: StoredEvent, b: StoredEvent): number {
  return a.sequence - b.sequence || a.id.localeCompare(b.id);
}
function refKey(projectId: string, ref: Ref): string {
  return `${projectId}/${ref.sessionId}/${ref.turnId ?? ""}`;
}
function sessionKey(projectId: string, sessionId: string): string {
  return `${projectId}/${sessionId}`;
}

/** Projects recorded v2 activity into deterministic turn and subagent views. */
export function activity(events: StoredEvent[]): ActivityView {
  const ordered = [...events].sort(compareEvents);
  const turns = new Map<
    string,
    {
      projectId: string;
      sessionId: string;
      turnId: string;
      eventIds: string[];
      declarations: ActivityView["turns"][number]["declarations"];
    }
  >();
  const sessions = new Set(ordered.map((event) => sessionKey(event.projectId, event.sessionId)));
  const ended = new Set(
    ordered
      .filter((event) => event.payload.kind === "session_end")
      .map((event) => sessionKey(event.projectId, event.sessionId)),
  );
  const links = new Map<string, Link>();

  const addLink = (
    relation: Link["relation"],
    projectId: string,
    parent: Ref,
    child: Ref,
    eventId: string,
  ) => {
    const key = JSON.stringify([relation, projectId, parent, child]);
    const existing = links.get(key);
    if (existing) {
      existing.evidenceIds.push(eventId);
      return;
    }
    links.set(key, {
      relation,
      projectId,
      parent,
      child,
      evidenceIds: [eventId],
      rule: ACTIVITY_RULE,
      uncertainty: UNCERTAINTY,
    });
  };

  for (const event of ordered) {
    if (event.schemaVersion !== 2) continue;
    const { activity: declared } = event;
    if (declared.turnId) {
      const key = refKey(event.projectId, { sessionId: event.sessionId, turnId: declared.turnId });
      const turn = turns.get(key) ?? {
        projectId: event.projectId,
        sessionId: event.sessionId,
        turnId: declared.turnId,
        eventIds: [],
        declarations: [],
      };
      turn.eventIds.push(event.id);
      for (const kind of ["plan", "decision", "approval", "correction"] as const) {
        const content = event.declared[kind];
        if (content) turn.declarations.push({ kind, eventId: event.id, state: content.state });
      }
      turns.set(key, turn);
    }
    const current = { sessionId: event.sessionId, turnId: declared.turnId };
    if (declared.parentSessionId)
      addLink(
        "parent",
        event.projectId,
        { sessionId: declared.parentSessionId, turnId: declared.parentTurnId },
        current,
        event.id,
      );
    if (declared.childSessionId)
      addLink(
        "spawned",
        event.projectId,
        current,
        { sessionId: declared.childSessionId, turnId: declared.childTurnId },
        event.id,
      );
  }

  const turnViews = [...turns.values()]
    .map((turn) => ({
      id: hash("turn", [turn.projectId, turn.sessionId, turn.turnId]),
      ...turn,
      ended: ended.has(sessionKey(turn.projectId, turn.sessionId)),
      evidenceIds: [...turn.eventIds],
      rule: ACTIVITY_RULE,
      uncertainty: UNCERTAINTY,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const turnKeys = new Set(turnViews.map((turn) => refKey(turn.projectId, turn)));
  const subagents = [...links.values()]
    .map((link) => ({
      id: hash("subagent", [link.relation, link.projectId, link.parent, link.child]),
      ...link,
      evidenceIds: [...new Set(link.evidenceIds)],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const gaps: ActivityGap[] = [];
  for (const link of subagents) {
    const parentKnown = link.parent.turnId
      ? turnKeys.has(refKey(link.projectId, link.parent))
      : sessions.has(sessionKey(link.projectId, link.parent.sessionId));
    if (!parentKnown)
      gaps.push({
        id: hash("gap", ["missing_parent", link.id]),
        kind: "missing_parent",
        projectId: link.projectId,
        sessionId: link.child.sessionId,
        turnId: link.child.turnId,
        evidenceIds: link.evidenceIds,
        rule: ACTIVITY_RULE,
        uncertainty:
          "The source named a parent identity that has no retained matching activity evidence.",
      });
    const childKnown = link.child.turnId
      ? turnKeys.has(refKey(link.projectId, link.child))
      : sessions.has(sessionKey(link.projectId, link.child.sessionId));
    if (!childKnown)
      gaps.push({
        id: hash("gap", ["missing_child", link.id]),
        kind: "missing_child",
        projectId: link.projectId,
        sessionId: link.parent.sessionId,
        turnId: link.parent.turnId,
        evidenceIds: link.evidenceIds,
        rule: ACTIVITY_RULE,
        uncertainty:
          "The source named a child identity that has no retained matching activity evidence.",
      });
  }
  for (const turn of turnViews) {
    if (turn.ended) continue;
    gaps.push({
      id: hash("gap", ["missing_end", turn.projectId, turn.sessionId, turn.turnId]),
      kind: "missing_end",
      projectId: turn.projectId,
      sessionId: turn.sessionId,
      turnId: turn.turnId,
      evidenceIds: turn.evidenceIds,
      rule: ACTIVITY_RULE,
      uncertainty: "No session-end observation was retained for this turn's session.",
    });
  }
  return {
    turns: turnViews,
    subagents,
    gaps: gaps.sort((a, b) => a.id.localeCompare(b.id)),
    rule: ACTIVITY_RULE,
    uncertainty: UNCERTAINTY,
  };
}
