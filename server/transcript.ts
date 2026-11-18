import { closeSync, openSync, readSync, statSync } from "node:fs";
import type { NoteRow, Store, UsageRow } from "./db.ts";
import { redact } from "./redact.ts";

const MAX_READ = 8 * 1024 * 1024;

/**
 * Claude Code writes every assistant message to a JSONL transcript with its
 * reported token usage. Hooks do not carry usage, so this is where tokens come from.
 * A message appears once per content block; rows are keyed by message id.
 */
export function usageFromLines(lines: string[], sessionId: string, agentId: string): UsageRow[] {
  const rows: UsageRow[] = [];
  for (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== "assistant") continue;
    const message = entry.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    if (!message || !usage || typeof message.id !== "string") continue;
    const n = (k: string) => (typeof usage[k] === "number" ? (usage[k] as number) : 0);
    rows.push({
      messageId: message.id,
      sessionId,
      agentId:
        typeof entry.agentId === "string" && entry.isSidechain
          ? (entry.agentId as string)
          : agentId,
      model: typeof message.model === "string" ? message.model : null,
      at: typeof entry.timestamp === "string" ? entry.timestamp : new Date().toISOString(),
      input: n("input_tokens"),
      output: n("output_tokens"),
      cacheRead: n("cache_read_input_tokens"),
      cacheWrite: n("cache_creation_input_tokens"),
    });
  }
  return rows;
}

/** Longest note kept; longer text is cut and marked. */
const MAX_NOTE = 4000;

/**
 * What the agent wrote between tool calls (`text` blocks) and its thinking (`thinking` blocks),
 * from Claude Code transcript lines (#46). Only text the transcript contains is kept: a thinking
 * block whose text is empty (omitted or redacted by the model) is skipped. Tool use and tool
 * results are not notes; hooks record those.
 */
export function notesFromLines(lines: string[], sessionId: string, agentId: string): NoteRow[] {
  const rows: NoteRow[] = [];
  for (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== "assistant") continue;
    const message = entry.message as Record<string, unknown> | undefined;
    if (!Array.isArray(message?.content)) continue;
    const key =
      typeof entry.uuid === "string"
        ? entry.uuid
        : typeof message.id === "string"
          ? message.id
          : null;
    if (!key) continue;
    message.content.forEach((block: unknown, i: number) => {
      const b = (block && typeof block === "object" ? block : {}) as Record<string, unknown>;
      const raw = b.type === "text" ? b.text : b.type === "thinking" ? b.thinking : undefined;
      if (typeof raw !== "string" || !raw.trim()) return;
      const text = raw.trim();
      rows.push({
        id: `${key}:${i}`,
        sessionId,
        agentId:
          typeof entry.agentId === "string" && entry.isSidechain
            ? (entry.agentId as string)
            : agentId,
        at: typeof entry.timestamp === "string" ? entry.timestamp : new Date().toISOString(),
        kind: b.type === "thinking" ? "thinking" : "said",
        text: text.length > MAX_NOTE ? `${text.slice(0, MAX_NOTE - 1)}…` : text,
      });
    });
  }
  return rows;
}

/**
 * Reads only the new complete lines since the last call, in blocks of at most 8 MB, until
 * caught up. A single line longer than a block (a pasted image, a huge tool result) is
 * skipped instead of stalling every later line; its usage, if any, is not counted.
 */
export function syncTranscript(
  store: Store,
  path: string,
  sessionId: string,
  agentId: string,
  maxRead = MAX_READ,
) {
  if (!path.endsWith(".jsonl")) return;
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return;
  }
  let offset = store.transcriptOffset(path);
  if (size < offset) offset = 0;
  const fd = openSync(path, "r");
  try {
    while (offset < size) {
      const length = Math.min(size - offset, maxRead);
      const buffer = Buffer.alloc(length);
      readSync(fd, buffer, 0, length, offset);
      const end = buffer.lastIndexOf(0x0a);
      if (end < 0) {
        // No line ends in this block: either the last line is still being written,
        // or one line is longer than a block. Skip the latter to its newline.
        if (length < maxRead) break;
        const next = nextNewline(fd, offset + length, size, maxRead);
        if (next < 0) break;
        offset = next + 1;
      } else {
        const lines = buffer.subarray(0, end).toString("utf8").split("\n");
        for (const row of usageFromLines(lines, sessionId, agentId)) store.upsertUsage(row);
        const clean = store.settings().redact;
        for (const note of notesFromLines(lines, sessionId, agentId)) {
          store.addNote(clean ? { ...note, text: redact(note.text) } : note);
        }
        offset += end + 1;
      }
      store.setTranscriptOffset(path, sessionId, agentId, offset);
    }
  } finally {
    closeSync(fd);
  }
}

/** Byte position of the first newline at or after `from`, or -1 when there is none yet. */
function nextNewline(fd: number, from: number, size: number, block: number): number {
  const buffer = Buffer.alloc(block);
  for (let at = from; at < size; at += block) {
    const n = readSync(fd, buffer, 0, Math.min(block, size - at), at);
    const i = buffer.subarray(0, n).indexOf(0x0a);
    if (i >= 0) return at + i;
  }
  return -1;
}
