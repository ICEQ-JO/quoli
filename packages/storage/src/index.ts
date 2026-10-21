import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  batchSchema,
  type CapturePolicy,
  defaultPolicy,
  type NormalizedEvent,
  type Project,
  policySchema,
  type Session,
  type StoredEvent,
} from "@traceframe/schema";
import { redact, sanitizeContent, sanitizeEvent } from "@traceframe/schema/privacy";

export class Store {
  private db: DatabaseSync;
  constructor(
    path: string,
    private readonly limits = { maxEvents: 10000, maxBytes: 50 * 1024 * 1024 },
  ) {
    if (
      !Number.isSafeInteger(limits.maxEvents) ||
      limits.maxEvents < 1 ||
      limits.maxEvents > 10000 ||
      !Number.isSafeInteger(limits.maxBytes) ||
      limits.maxBytes < 1024 ||
      limits.maxBytes > 50 * 1024 * 1024
    )
      throw new Error("Invalid store limits");
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      chmodSync(dirname(path), 0o700);
    }
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;");
    try {
      this.db.exec(readFileSync(new URL("../migrations/001-initial.sql", import.meta.url), "utf8"));
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
  }
  registerProject(
    id: string,
    name: string,
    synthetic = false,
    policy: CapturePolicy = defaultPolicy,
  ): void {
    const clean = policySchema.parse(policy);
    this.db
      .prepare("INSERT OR IGNORE INTO projects VALUES(?,?,?,?)")
      .run(id, redact(name).slice(0, 100), Number(synthetic), JSON.stringify(clean));
  }
  projects(): Project[] {
    return this.db
      .prepare("SELECT * FROM projects ORDER BY id LIMIT 50")
      .all()
      .map((r) => ({
        id: String(r.id),
        name: String(r.name),
        synthetic: Boolean(r.synthetic),
        policy: policySchema.parse(JSON.parse(String(r.policy))),
      }));
  }
  project(id: string): Project | undefined {
    return this.projects().find((p) => p.id === id);
  }
  append(input: NormalizedEvent[]): { accepted: number; duplicates: number } {
    const events = batchSchema.parse({ events: input }).events;
    let accepted = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const raw of events) {
        const project = this.project(raw.projectId);
        if (!project) throw new Error("Project not registered");
        if (project.synthetic && raw.source !== "synthetic")
          throw new Error("Demo project accepts synthetic observations only");
        const prior = this.db
          .prepare(
            "SELECT body FROM events WHERE project_id=? AND source=? AND producer_id=? AND delivery_id=?",
          )
          .get(raw.projectId, raw.source, raw.producerId, raw.deliveryId);
        const event = sanitizeEvent(raw, project.policy);
        if (event.payload.kind === "tool_result") {
          const call = this.db
            .prepare(
              "SELECT body FROM events WHERE project_id=? AND session_id=? AND json_extract(body,'$.toolId')=? AND json_extract(body,'$.payload.kind')='tool_call' ORDER BY sequence DESC LIMIT 1",
            )
            .get(event.projectId, event.sessionId, event.toolId);
          const callEvent = call ? (JSON.parse(String(call.body)) as NormalizedEvent) : null;
          const priorEvent = prior ? (JSON.parse(String(prior.body)) as NormalizedEvent) : null;
          // Missing/out-of-order calls cannot establish whether a file was excluded.
          // Preserve an earlier omission on retries even if a late call has arrived.
          if (
            !callEvent ||
            ("content" in callEvent.payload && callEvent.payload.content.state === "disabled") ||
            (priorEvent?.payload.kind === "tool_result" &&
              priorEvent.payload.content.state === "disabled")
          ) {
            event.payload.content = { ...event.payload.content, text: null, state: "disabled" };
          }
        }
        const body = JSON.stringify(event);
        if (prior) {
          if (prior.body !== body) throw new Error("Delivery identity conflict");
          continue;
        }
        const quota = this.db
          .prepare(
            "SELECT count(*) AS count,coalesce(sum(length(CAST(body AS BLOB))),0) AS bytes FROM events WHERE project_id=?",
          )
          .get(raw.projectId);
        if (
          Number(quota?.count) >= this.limits.maxEvents ||
          Number(quota?.bytes) + Buffer.byteLength(body) > this.limits.maxBytes
        )
          throw new Error("Project storage limit reached");
        this.db
          .prepare(
            "INSERT INTO events(id,project_id,session_id,source,producer_id,delivery_id,received_at,body) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            event.id,
            event.projectId,
            event.sessionId,
            event.source,
            event.producerId,
            event.deliveryId,
            new Date().toISOString(),
            body,
          );
        accepted++;
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { accepted, duplicates: events.length - accepted };
  }
  events(project: string, session: string, cursor = 0, limit = 8) {
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE project_id=? AND session_id=? AND sequence>? ORDER BY sequence LIMIT ?",
      )
      .all(project, session, cursor, limit + 1);
    const hasMore = rows.length > limit;
    const events: StoredEvent[] = rows.slice(0, limit).map((r) => ({
      ...JSON.parse(String(r.body)),
      sequence: Number(r.sequence),
      receivedAt: String(r.received_at),
    }));
    const total = Number(
      this.db
        .prepare("SELECT count(*) AS count FROM events WHERE project_id=? AND session_id=?")
        .get(project, session)?.count ?? 0,
    );
    return { events, total, nextCursor: hasMore ? (events.at(-1)?.sequence ?? null) : null };
  }
  allEvents(project: string, session: string): StoredEvent[] {
    return this.events(project, session, 0, 10000).events;
  }
  sessions(project: string): Session[] {
    const rows = this.db
      .prepare(
        "SELECT session_id,count(*) AS count,min(sequence) AS first FROM events WHERE project_id=? GROUP BY session_id ORDER BY first DESC LIMIT 50",
      )
      .all(project);
    return rows.map((r) => {
      const events = this.allEvents(project, String(r.session_id));
      const start = events.find((e) => e.payload.kind === "session_start");
      return {
        id: String(r.session_id),
        title:
          start?.payload.kind === "session_start"
            ? (start.payload.content.text ?? "Content capture disabled")
            : "Session start unavailable",
        startedAt: start?.sourceTime ?? null,
        count: Number(r.count),
        ended: events.some((e) => e.payload.kind === "session_end"),
      };
    });
  }
  artifact(projectId: string, id: string, text: string): void {
    if (Buffer.byteLength(text) > 1048576) throw new Error("Artifact exceeds in-memory limit");
    const project = this.project(projectId);
    if (!project) throw new Error("Project not registered");
    const content = sanitizeContent(
      { text, state: "present", originalBytes: null, categories: ["code"] },
      project.policy,
    );
    this.db
      .prepare("INSERT INTO artifacts VALUES(?,?,?)")
      .run(id, projectId, JSON.stringify(content));
  }
  close(): void {
    this.db.close();
  }
}
