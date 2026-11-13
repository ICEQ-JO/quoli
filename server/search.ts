import type { EventHit, SessionDetail } from "../shared/model.ts";

const MAX_TEXT = 160;

/** The line of `text` that holds the match, cut around it. */
function around(text: string, at: number): string {
  const start = text.lastIndexOf("\n", at) + 1;
  const end = text.indexOf("\n", at);
  const line = text.slice(start, end < 0 ? undefined : end).trim();
  const rel = at - start;
  return line.length <= MAX_TEXT
    ? line
    : `${rel > 40 ? "…" : ""}${line.slice(Math.max(0, rel - 40), Math.max(0, rel - 40) + MAX_TEXT)}…`;
}

/**
 * Prompts, shell commands and failed-call output that contain the query, newest first. These are
 * recorded text, searched as plain substrings; nothing is run or replayed.
 */
export function searchEvents(sessions: SessionDetail[], raw: string, limit = 20): EventHit[] {
  const q = raw.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: EventHit[] = [];
  for (const s of sessions) {
    const add = (kind: EventHit["kind"], callId: string | null, text: string, at: string) => {
      const i = text.toLowerCase().indexOf(q);
      if (i >= 0)
        hits.push({
          kind,
          sessionId: s.id,
          sessionTitle: s.title,
          callId,
          text: around(text, i),
          at,
        });
    };
    for (const t of s.turns) add("prompt", t.toolCallIds[0] ?? null, t.prompt, t.at);
    for (const c of s.toolCalls) {
      if (c.category === "run") {
        const input = (c.input ?? {}) as Record<string, unknown>;
        add(
          "command",
          c.id,
          typeof input.command === "string" ? input.command : c.summary,
          c.startedAt,
        );
      }
      if (c.status === "failed" && c.output) add("error", c.id, c.output, c.startedAt);
    }
  }
  return hits.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
