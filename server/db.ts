import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Settings, TokenTotals } from "../shared/model.ts";

/** Stable project id used in URLs: first 12 hex chars of sha256(root). */
export const projectId = (root: string) =>
  createHash("sha256").update(root).digest("hex").slice(0, 12);

export const DEFAULT_SETTINGS: Settings = {
  retentionDays: null,
  redact: true,
  budgetDailyUsd: null,
  budgetMonthlyUsd: null,
};

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
      CREATE INDEX IF NOT EXISTS transcripts_session ON transcripts(session_id);
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        root TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        connected_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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

  /** Registers (or re-registers) a project connected through Quoli. */
  registerProject(root: string, at = new Date().toISOString()) {
    this.db
      .prepare(
        `INSERT INTO projects (id, root, name, connected_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(root) DO UPDATE SET connected_at = excluded.connected_at`,
      )
      .run(projectId(root), root, basename(root), at);
  }

  unregisterProject(root: string) {
    this.db.prepare("DELETE FROM projects WHERE root = ?").run(root);
  }

  registeredProjects(): { root: string; connectedAt: string }[] {
    return this.db
      .prepare("SELECT root, connected_at FROM projects")
      .all()
      .map((r) => ({ root: String(r.root), connectedAt: String(r.connected_at) }));
  }

  isRegistered(root: string) {
    return !!this.db.prepare("SELECT 1 FROM projects WHERE root = ?").get(root);
  }

  /** Newest sessions first across every project. */
  recentSessionIds(limit: number): string[] {
    return this.db
      .prepare("SELECT session_id FROM events GROUP BY session_id ORDER BY MAX(at) DESC LIMIT ?")
      .all(limit)
      .map((r) => String(r.session_id));
  }

  rootSessionIds(root: string): string[] {
    return this.db
      .prepare("SELECT DISTINCT session_id FROM events WHERE root = ?")
      .all(root)
      .map((r) => String(r.session_id));
  }

  /** Sessions whose newest event is older than the cutoff. */
  staleSessionIds(cutoff: string): string[] {
    return this.db
      .prepare("SELECT session_id FROM events GROUP BY session_id HAVING MAX(at) < ?")
      .all(cutoff)
      .map((r) => String(r.session_id));
  }

  /** Really deletes whole sessions: events, usage rows and transcript offsets. */
  deleteSessions(ids: string[]): { events: number; sessions: number } {
    let events = 0;
    this.db.exec("BEGIN");
    try {
      for (const id of ids) {
        events += Number(
          this.db.prepare("DELETE FROM events WHERE session_id = ?").run(id).changes,
        );
        this.db.prepare("DELETE FROM usage WHERE session_id = ?").run(id);
        this.db.prepare("DELETE FROM transcripts WHERE session_id = ?").run(id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.checkpoint();
    return { events, sessions: ids.length };
  }

  checkpoint() {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  /** Token totals for usage rows at or after the given ISO time. */
  tokensSince(since: string) {
    const r = this.db
      .prepare(
        `SELECT COALESCE(SUM(input),0) AS i, COALESCE(SUM(output),0) AS o,
                COALESCE(SUM(cache_read),0) AS cr, COALESCE(SUM(cache_write),0) AS cw
         FROM usage WHERE at >= ?`,
      )
      .get(since) as Record<string, number> | undefined;
    return {
      input: Number(r?.i ?? 0),
      output: Number(r?.o ?? 0),
      cacheRead: Number(r?.cr ?? 0),
      cacheWrite: Number(r?.cw ?? 0),
    };
  }

  sessionCount(since?: string): number {
    const r = since
      ? this.db
          .prepare("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE at >= ?")
          .get(since)
      : this.db.prepare("SELECT COUNT(DISTINCT session_id) AS n FROM events").get();
    return Number(r?.n ?? 0);
  }

  settings(): Settings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'settings'").get();
    let saved: Partial<Settings> = {};
    try {
      if (row) saved = JSON.parse(String(row.value));
    } catch {}
    return { ...DEFAULT_SETTINGS, ...saved };
  }

  saveSettings(settings: Settings) {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES ('settings', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(JSON.stringify(settings));
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? String(row.value) : null;
  }

  putSetting(key: string, value: string) {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  deleteSetting(key: string) {
    this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }

  /** Usage rows at or after a time, with the project root of their session. */
  usageSince(since: string): (UsageRow & { root: string })[] {
    return this.db
      .prepare(
        `SELECT u.*, r.root FROM usage u
         JOIN (SELECT session_id, MIN(root) AS root FROM events GROUP BY session_id) r
           ON r.session_id = u.session_id
         WHERE u.at >= ? ORDER BY u.at`,
      )
      .all(since)
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
        root: String(r.root),
      }));
  }

  /** Usage since a time, grouped by model (null = no model id). */
  usageByModelSince(since: string): { model: string | null; tokens: TokenTotals }[] {
    return this.db
      .prepare(
        `SELECT model, SUM(input) AS i, SUM(output) AS o, SUM(cache_read) AS cr, SUM(cache_write) AS cw
         FROM usage WHERE at >= ? GROUP BY model`,
      )
      .all(since)
      .map((r) => ({
        model: r.model === null ? null : String(r.model),
        tokens: {
          input: Number(r.i),
          output: Number(r.o),
          cacheRead: Number(r.cr),
          cacheWrite: Number(r.cw),
        },
      }));
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
