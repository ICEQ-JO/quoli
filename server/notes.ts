import type { AgentNote, ToolCall } from "../shared/model.ts";
import type { NoteRow } from "./db.ts";

/**
 * Places each note before the first call its agent started at or after the note's time
 * (#46). A note with no later call by that agent (usually the closing words of a turn,
 * which the turn's reply also holds) gets `beforeCallId: null`.
 */
export function placeNotes(rows: NoteRow[], calls: ToolCall[]): AgentNote[] {
  const byAgent = new Map<string, ToolCall[]>();
  for (const c of [...calls].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const list = byAgent.get(c.agentId) ?? [];
    list.push(c);
    byAgent.set(c.agentId, list);
  }
  return rows.map((n) => ({
    at: n.at,
    agentId: n.agentId,
    kind: n.kind,
    text: n.text,
    beforeCallId: byAgent.get(n.agentId)?.find((c) => c.startedAt >= n.at)?.id ?? null,
  }));
}
