import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const home = () => process.env.QUOLI_HOME ?? join(homedir(), ".quoli");

export interface RawEvent {
  seq: number;
  sessionId: string;
  root: string;
  event: string;
  at: string;
  payload: Record<string, unknown>;
}

export interface UsageRow {
  messageId: string;
  sessionId: string;
  agentId: string;
  model: string | null;
  at: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Append-only hook events plus deduplicated token usage read from transcripts. */
export class Store {
  readonly db: DatabaseSync;

  constructor(file = join(home(), "quoli.db")) {
    if (file !== ":memory:") mkdirSync(join(file, ".."), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        root TEXT NOT NULL,
        event TEXT NOT NULL,
        at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_session ON events(session_id, seq);
      CREATE INDEX IF NOT EXISTS events_root ON events(root);
      CREATE TABLE IF NOT EXISTS usage (
        message_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        model TEXT,
        at TEXT NOT NULL,
        input INTEGER NOT NULL,
        output INTEGER NOT NULL,
        cache_read INTEGER NOT NULL,
        cache_write INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS usage_session ON usage(session_id);
      CREATE TABLE IF NOT EXISTS transcripts (
        path TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        offset INTEGER NOT NULL
      );
    `);
  }

  append(e: Omit<RawEvent, "seq">) {
    this.db
      .prepare("INSERT INTO events (session_id, root, event, at, payload) VALUES (?, ?, ?, ?, ?)")
      .run(e.sessionId, e.root, e.event, e.at, JSON.stringify(e.payload));
  }

  events(sessionId: string): RawEvent[] {
    return this.db
      .prepare("SELECT * FROM events WHERE session_id = ? ORDER BY seq")
      .all(sessionId)
      .map(toEvent);
  }

  sessionIds(root: string): string[] {
    return this.db
      .prepare(
        "SELECT session_id FROM events WHERE root = ? GROUP BY session_id ORDER BY MAX(at) DESC LIMIT 200",
      )
      .all(root)
      .map((r) => String(r.session_id));
  }

  roots(): { root: string; sessions: number; last: string }[] {
    return this.db
      .prepare(
        "SELECT root, COUNT(DISTINCT session_id) AS sessions, MAX(at) AS last FROM events GROUP BY root ORDER BY last DESC",
      )
      .all()
      .map((r) => ({ root: String(r.root), sessions: Number(r.sessions), last: String(r.last) }));
  }

  hasRoot(root: string) {
    return !!this.db.prepare("SELECT 1 FROM events WHERE root = ? LIMIT 1").get(root);
  }

  /** Keeps the largest value per field: transcripts repeat a message once per content block. */
  upsertUsage(u: UsageRow) {
    this.db
      .prepare(
        `INSERT INTO usage VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           input = MAX(input, excluded.input), output = MAX(output, excluded.output),
           cache_read = MAX(cache_read, excluded.cache_read), cache_write = MAX(cache_write, excluded.cache_write)`,
      )
      .run(
        u.messageId,
        u.sessionId,
        u.agentId,
        u.model,
        u.at,
        u.input,
        u.output,
        u.cacheRead,
        u.cacheWrite,
      );
  }

  usage(sessionId: string): UsageRow[] {
    return this.db
      .prepare("SELECT * FROM usage WHERE session_id = ? ORDER BY at")
      .all(sessionId)
      .map((r) => ({
        messageId: String(r.message_id),
        sessionId: String(r.session_id),
        agentId: String(r.agent_id),
        model: r.model === null ? null : String(r.model),
        at: String(r.at),
        input: Number(r.input),
        output: Number(r.output),
        cacheRead: Number(r.cache_read),
        cacheWrite: Number(r.cache_write),
      }));
  }

  transcriptOffset(path: string): number {
    const row = this.db.prepare("SELECT offset FROM transcripts WHERE path = ?").get(path);
    return row ? Number(row.offset) : 0;
  }

  setTranscriptOffset(path: string, sessionId: string, agentId: string, offset: number) {
    this.db
      .prepare(
        "INSERT INTO transcripts VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET offset = excluded.offset",
      )
      .run(path, sessionId, agentId, offset);
  }
}

function toEvent(r: Record<string, unknown>): RawEvent {
  return {
    seq: Number(r.seq),
    sessionId: String(r.session_id),
    root: String(r.root),
    event: String(r.event),
    at: String(r.at),
    payload: JSON.parse(String(r.payload)),
  };
}
