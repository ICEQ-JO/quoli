import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  batchSchema,
  type CapturePolicy,
  defaultPolicy,
  type EventQuery,
  eventSchema,
  type NormalizedEvent,
  type Project,
  policySchema,
  type Session,
  type StoredEvent,
} from "@traceframe/schema";
import { isExcluded, redact, sanitizeContent, sanitizeEvent } from "@traceframe/schema/privacy";
import {
  type ObservationStatus,
  type RepositorySnapshot,
  repositorySnapshotSchema,
  type SnapshotPage,
  type StoredSnapshot,
} from "@traceframe/schema/repository";

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
      this.migrate();
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      this.db.close();
      throw error;
    }
  }
  private migrate(): void {
    const migrations = [
      "001-initial.sql",
      "002-repository.sql",
      "003-lifecycle.sql",
      "004-repository-observation.sql",
      "005-event-schema-version.sql",
    ];
    for (const [index, migration] of migrations.entries()) {
      const version = index + 1;
      const exists = this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='migrations'")
        .get();
      const applied =
        exists && this.db.prepare("SELECT 1 FROM migrations WHERE version=?").get(version);
      if (!applied)
        this.db.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
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
    // Explicit registration is an owner action: it clears a previous deletion
    // and resumes capture for the new registration.
    this.db
      .prepare(
        "INSERT INTO project_lifecycle(project_id,paused,retention_days,purged_at,epoch) VALUES(?,0,NULL,NULL,1) ON CONFLICT(project_id) DO UPDATE SET purged_at=NULL,paused=0,epoch=epoch+1",
      )
      .run(id);
  }
  /** Lifecycle state for a project, including the deletion tombstone. */
  lifecycle(projectId: string): {
    paused: boolean;
    retentionDays: number | null;
    purgedAt: string | null;
    epoch: number;
  } {
    const row = this.db
      .prepare(
        "SELECT paused,retention_days,purged_at,epoch FROM project_lifecycle WHERE project_id=?",
      )
      .get(projectId);
    if (!row) return { paused: false, retentionDays: null, purgedAt: null, epoch: 1 };
    return {
      paused: Boolean(row.paused),
      retentionDays: row.retention_days === null ? null : Number(row.retention_days),
      purgedAt: row.purged_at === null ? null : String(row.purged_at),
      epoch: Number(row.epoch),
    };
  }
  /** Capture controls, retention window and storage usage for one project. */
  settings(projectId: string): {
    project: Project;
    paused: boolean;
    retentionDays: number | null;
    purgedAt: string | null;
    epoch: number;
    usage: { events: number; snapshots: number; artifacts: number; bytes: number };
  } {
    const project = this.project(projectId);
    if (!project) throw new Error("Project not registered");
    const lifecycle = this.lifecycle(projectId);
    return { project, ...lifecycle, usage: this.usage(projectId) };
  }
  usage(projectId: string): {
    events: number;
    snapshots: number;
    artifacts: number;
    bytes: number;
  } {
    const row = this.db
      .prepare(
        `SELECT
        (SELECT count(*) FROM events WHERE project_id=?) AS events,
        (SELECT count(*) FROM snapshots WHERE project_id=?) AS snapshots,
        (SELECT count(*) FROM artifacts WHERE project_id=?) AS artifacts,
        (SELECT coalesce(sum(length(CAST(body AS BLOB))),0) FROM events WHERE project_id=?) +
        (SELECT coalesce(sum(length(CAST(body AS BLOB))),0) FROM snapshots WHERE project_id=?) +
        (SELECT coalesce(sum(length(CAST(body AS BLOB))),0) FROM artifacts WHERE project_id=?) AS bytes`,
      )
      .get(projectId, projectId, projectId, projectId, projectId, projectId);
    return {
      events: Number(row?.events ?? 0),
      snapshots: Number(row?.snapshots ?? 0),
      artifacts: Number(row?.artifacts ?? 0),
      bytes: Number(row?.bytes ?? 0),
    };
  }
  /**
   * Applies a capture policy, pause or retention window. New content is
   * sanitized under the updated policy before it is persisted.
   */
  updateSettings(
    projectId: string,
    update: {
      policy?: Partial<CapturePolicy>;
      paused?: boolean;
      retentionDays?: number | null;
    },
  ): void {
    const project = this.project(projectId);
    if (!project) throw new Error("Project not registered");
    const policy = update.policy
      ? policySchema.parse({
          ...project.policy,
          ...update.policy,
          excludedPaths: update.policy.excludedPaths ?? project.policy.excludedPaths,
        })
      : project.policy;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("UPDATE projects SET policy=? WHERE id=?")
        .run(JSON.stringify(policy), projectId);
      if (update.paused !== undefined)
        this.db
          .prepare(
            "INSERT INTO project_lifecycle(project_id,paused,retention_days,purged_at,epoch) VALUES(?,?,NULL,NULL,1) ON CONFLICT(project_id) DO UPDATE SET paused=excluded.paused",
          )
          .run(projectId, Number(update.paused));
      if (update.retentionDays !== undefined)
        this.db
          .prepare(
            "INSERT INTO project_lifecycle(project_id,paused,retention_days,purged_at,epoch) VALUES(?,0,?,NULL,1) ON CONFLICT(project_id) DO UPDATE SET retention_days=excluded.retention_days",
          )
          .run(projectId, update.retentionDays);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (update.retentionDays !== undefined) this.applyRetention(projectId);
  }
  /** Removes data older than the project's retention window. */
  applyRetention(
    projectId: string,
    now = Date.now(),
  ): {
    events: number;
    snapshots: number;
    artifacts: number;
    bytes: number;
  } {
    const lifecycle = this.lifecycle(projectId);
    if (lifecycle.retentionDays === null) return this.usage(projectId);
    const cutoff = new Date(now - lifecycle.retentionDays * 86_400_000).toISOString();
    const before = this.usage(projectId);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.dropImmutability();
      this.db
        .prepare("DELETE FROM snapshots WHERE project_id=? AND json_extract(body,'$.capturedAt')<?")
        .run(projectId, cutoff);
      this.db
        .prepare("DELETE FROM events WHERE project_id=? AND received_at<?")
        .run(projectId, cutoff);
      this.restoreImmutability();
      this.db.exec("COMMIT");
      const after = this.usage(projectId);
      return {
        events: before.events - after.events,
        snapshots: before.snapshots - after.snapshots,
        artifacts: 0,
        bytes: before.bytes - after.bytes,
      };
    } catch (error) {
      try {
        this.restoreImmutability();
      } catch {}
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  /**
   * Removes every retained record of one project and leaves a tombstone that
   * blocks stale producers and retries. Idempotent after an interruption.
   */
  purgeProject(projectId: string): {
    removed: { events: number; snapshots: number; artifacts: number; bytes: number };
    purgedAt: string;
    epoch: number;
    checkpointed: boolean;
  } {
    const lifecycle = this.lifecycle(projectId);
    const purgedAt = lifecycle.purgedAt ?? new Date().toISOString();
    const before = this.usage(projectId);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.dropImmutability();
      this.db.prepare("DELETE FROM snapshots WHERE project_id=?").run(projectId);
      this.db.prepare("DELETE FROM artifacts WHERE project_id=?").run(projectId);
      this.db.prepare("DELETE FROM events WHERE project_id=?").run(projectId);
      this.db.prepare("DELETE FROM repositories WHERE project_id=?").run(projectId);
      this.db.prepare("DELETE FROM repository_observation WHERE project_id=?").run(projectId);
      this.db.prepare("DELETE FROM projects WHERE id=?").run(projectId);
      this.db
        .prepare(
          "INSERT INTO project_lifecycle(project_id,paused,retention_days,purged_at,epoch) VALUES(?,1,NULL,?,?) ON CONFLICT(project_id) DO UPDATE SET purged_at=excluded.purged_at,epoch=project_lifecycle.epoch+1,paused=1",
        )
        .run(projectId, purgedAt, lifecycle.epoch + 1);
      this.restoreImmutability();
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.restoreImmutability();
      } catch {}
      this.db.exec("ROLLBACK");
      throw error;
    }
    // Truncate the write-ahead log so removed content does not stay in the WAL file.
    let checkpointed = false;
    try {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      checkpointed = true;
    } catch {}
    const after = this.usage(projectId);
    return {
      removed: {
        events: before.events - after.events,
        snapshots: before.snapshots - after.snapshots,
        artifacts: before.artifacts - after.artifacts,
        bytes: before.bytes - after.bytes,
      },
      purgedAt,
      epoch: lifecycle.epoch + 1,
      checkpointed,
    };
  }
  private dropImmutability(): void {
    this.db.exec(
      "DROP TRIGGER IF EXISTS immutable_events_update; DROP TRIGGER IF EXISTS immutable_events_delete; DROP TRIGGER IF EXISTS immutable_snapshots_update; DROP TRIGGER IF EXISTS immutable_snapshots_delete;",
    );
  }
  private restoreImmutability(): void {
    this.db.exec(
      "CREATE TRIGGER IF NOT EXISTS immutable_events_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'append-only events'); END; CREATE TRIGGER IF NOT EXISTS immutable_events_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'append-only events'); END; CREATE TRIGGER IF NOT EXISTS immutable_snapshots_update BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT,'append-only snapshots'); END; CREATE TRIGGER IF NOT EXISTS immutable_snapshots_delete BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT,'append-only snapshots'); END;",
    );
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
    const ownTransaction = !this.db.isTransaction;
    if (ownTransaction) this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const raw of events) {
        const lifecycle = this.lifecycle(raw.projectId);
        // A deleted project stays deleted for stale producers and retries.
        if (lifecycle.purgedAt) throw new Error("Project evidence was deleted");
        if (lifecycle.paused) throw new Error("Capture is paused for this project");
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
        // Recorded paths are stored relative to the registered root, so a
        // captured file and a referenced path describe the same file.
        const root = this.repository(raw.projectId)?.root;
        if (root && event.payload.kind === "tool_call" && event.payload.path) {
          const inside = relative(root, event.payload.path);
          if (inside && !inside.startsWith("..")) event.payload.path = inside;
        }
        if (event.payload.kind === "tool_result") {
          const call = this.db
            .prepare(
              "SELECT body FROM events WHERE project_id=? AND session_id=? AND json_extract(body,'$.toolId')=? AND json_extract(body,'$.payload.kind')='tool_call' ORDER BY sequence DESC LIMIT 1",
            )
            .get(event.projectId, event.sessionId, event.toolId);
          const callEvent = call ? this.event(call.body) : null;
          const priorEvent = prior ? this.event(prior.body) : null;
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
          this.projectBytes(raw.projectId) + Buffer.byteLength(body) > this.limits.maxBytes
        )
          throw new Error("Project storage limit reached");
        this.db
          .prepare(
            "INSERT INTO events(id,project_id,session_id,source,producer_id,delivery_id,received_at,schema_version,body) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .run(
            event.id,
            event.projectId,
            event.sessionId,
            event.source,
            event.producerId,
            event.deliveryId,
            new Date().toISOString(),
            event.schemaVersion,
            body,
          );
        accepted++;
      }
      if (ownTransaction) this.db.exec("COMMIT");
    } catch (error) {
      if (ownTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
    return { accepted, duplicates: events.length - accepted };
  }
  events(project: string, session: string, cursor = 0, limit = 8, query?: EventQuery) {
    const order = query?.order ?? "receipt";
    const conditions = ["project_id=?", "session_id=?"];
    const values: SQLInputValue[] = [project, session];
    const kind = "json_extract(body,'$.payload.kind')";
    const tool = "json_extract(body,'$.payload.toolName')";
    if (query?.kind && query.kind !== "all") {
      if (query.kind === "tools") conditions.push(`${kind} IN ('tool_call','tool_result')`);
      else if (query.kind === "commands")
        conditions.push(`${kind} IN ('tool_call','tool_result') AND ${tool}='Bash'`);
      else if (query.kind === "files")
        conditions.push(
          `(${kind} IN ('repository_snapshot','repository_state') OR (${kind} IN ('tool_call','tool_result') AND ${tool} IN ('Read','Write','Edit')))`,
        );
      else {
        conditions.push(`${kind}=?`);
        values.push(query.kind);
      }
    }
    if (query?.search.trim()) {
      conditions.push(
        `instr(lower(coalesce(json_extract(body,'$.payload.content.text'),'') || ' ' || coalesce(json_extract(body,'$.payload.path'),'') || ' ' || coalesce(${tool},'') || ' ' || coalesce(${kind},'') || ' ' || coalesce(json_extract(body,'$.payload.reason'),'')),lower(?))>0`,
      );
      values.push(query.search.trim());
    }
    const base = conditions.join(" AND ");
    const total = Number(
      this.db.prepare(`SELECT count(*) AS count FROM events WHERE ${base}`).get(...values)?.count ??
        0,
    );
    const sourceTime =
      "coalesce(strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(body,'$.sourceTime')),'9999')";
    if (order === "source" && cursor) {
      const anchor = this.db
        .prepare(
          `SELECT ${sourceTime} AS time FROM events WHERE project_id=? AND session_id=? AND sequence=?`,
        )
        .get(project, session, cursor);
      if (!anchor) throw new Error("Unknown source-order cursor");
      conditions.push(`(${sourceTime}>? OR (${sourceTime}=? AND sequence>?))`);
      values.push(anchor.time as string, anchor.time as string, cursor);
    } else if (order === "receipt") {
      conditions.push("sequence>?");
      values.push(cursor);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM events WHERE ${conditions.join(" AND ")} ORDER BY ${order === "source" ? `${sourceTime},` : ""}sequence LIMIT ?`,
      )
      .all(...values, limit + 1);
    const hasMore = rows.length > limit;
    const events = rows.slice(0, limit).map((row) => this.storedEvent(row));
    return { events, total, nextCursor: hasMore ? (events.at(-1)?.sequence ?? null) : null };
  }
  allEvents(project: string, session: string): StoredEvent[] {
    return this.events(project, session, 0, 10000).events;
  }
  private event(body: unknown): NormalizedEvent {
    return eventSchema.parse(JSON.parse(String(body)));
  }
  private storedEvent(row: Record<string, unknown>): StoredEvent {
    return {
      ...this.event(row.body),
      sequence: Number(row.sequence),
      receivedAt: String(row.received_at),
    };
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
      const repository = events.some((e) => e.producerId === "repository-observer-v1");
      return {
        id: String(r.session_id),
        title: repository
          ? `Repository history · ${String(r.session_id).slice(-10)}`
          : start?.payload.kind === "session_start"
            ? (start.payload.content.text ?? "Content capture disabled")
            : events.some((e) => e.payload.kind === "repository_snapshot")
              ? "Repository review"
              : "Session start unavailable",
        startedAt: start?.sourceTime ?? (repository ? (events[0]?.sourceTime ?? null) : null),
        count: Number(r.count),
        ended: events.some((e) => e.payload.kind === "session_end"),
        ...(repository ? { kind: "repository" as const } : {}),
      };
    });
  }
  sessionCounts(project: string): Record<string, { kindCounts: Record<string, number> }> {
    const rows = this.db
      .prepare(`WITH recent AS (
      SELECT session_id,min(sequence) AS first FROM events WHERE project_id=?
      GROUP BY session_id ORDER BY first DESC LIMIT 50
    ) SELECT e.session_id,json_extract(e.body,'$.payload.kind') AS kind,count(*) AS count
      FROM events e JOIN recent r ON e.session_id=r.session_id
      WHERE e.project_id=? GROUP BY e.session_id,kind`)
      .all(project, project);
    const counts = new Map<string, { kindCounts: Record<string, number> }>();
    for (const row of rows) {
      const id = String(row.session_id),
        item = counts.get(id) ?? { kindCounts: {} };
      item.kindCounts[String(row.kind)] = Number(row.count);
      counts.set(id, item);
    }
    return Object.fromEntries(counts);
  }
  private projectBytes(projectId: string): number {
    return Number(
      this.db
        .prepare(`SELECT
      (SELECT coalesce(sum(length(CAST(body AS BLOB))),0) FROM events WHERE project_id=?) +
      (SELECT coalesce(sum(length(CAST(body AS BLOB))),0) FROM snapshots WHERE project_id=?) +
      (SELECT coalesce(sum(length(CAST(body AS BLOB))),0) FROM artifacts WHERE project_id=?) AS bytes`)
        .get(projectId, projectId, projectId)?.bytes ?? 0,
    );
  }
  registerLocalRepository(
    id: string,
    name: string,
    root: string,
    policy: CapturePolicy,
    includeUntracked: boolean,
  ): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.project(id)) throw new Error("Project already registered");
      this.registerProject(id, name, false, policy);
      this.registerRepository(id, root, includeUntracked);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  registerRepository(projectId: string, root: string, includeUntracked: boolean): void {
    const project = this.project(projectId);
    if (!project || project.synthetic) throw new Error("Real project required");
    if (this.db.prepare("SELECT 1 FROM repositories WHERE project_id=?").get(projectId))
      throw new Error("Repository already registered");
    this.db
      .prepare("INSERT INTO repositories(project_id,root,include_untracked) VALUES(?,?,?)")
      .run(projectId, root, Number(includeUntracked));
  }
  repository(projectId: string): { root: string; includeUntracked: boolean } | null {
    const row = this.db
      .prepare("SELECT root,include_untracked FROM repositories WHERE project_id=?")
      .get(projectId);
    return row
      ? { root: String(row.root), includeUntracked: Boolean(row.include_untracked) }
      : null;
  }
  appendSnapshot(
    projectId: string,
    sessionId: string,
    input: RepositorySnapshot,
    reason: "baseline" | "checkpoint",
    observations: NormalizedEvent[] = [],
    expectedEpoch?: number,
  ): StoredSnapshot {
    if (
      observations.some((event) => event.projectId !== projectId || event.sessionId !== sessionId)
    )
      throw new Error("Snapshot observations must share scope");
    const project = this.project(projectId);
    if (!project) throw new Error("Project not registered");
    const snapshot = repositorySnapshotSchema.parse(input);
    const files = snapshot.files.map((file) => {
      const captured =
        file.status === "present" || file.status === "racy"
          ? file.content
          : { ...file.content, text: null };
      const content = isExcluded(file.path, project.policy)
        ? { ...captured, text: null, state: "disabled" as const, categories: ["code" as const] }
        : sanitizeContent(captured, project.policy, ["code"]);
      return {
        ...file,
        path: redact(file.path),
        content,
        fingerprint:
          content.text === null ? null : createHash("sha256").update(content.text).digest("hex"),
      };
    });
    const clean = repositorySnapshotSchema.parse({
      ...snapshot,
      files,
      warnings: snapshot.warnings.map(redact),
    });
    const eventId = `obs_${createHash("sha256").update(`${projectId}:${clean.id}`).digest("hex").slice(0, 40)}`;
    const stored: StoredSnapshot = { ...clean, projectId, sessionId, reason, eventId };
    const body = JSON.stringify(stored);
    const prior = this.db
      .prepare("SELECT body FROM snapshots WHERE project_id=? AND id=?")
      .get(projectId, clean.id);
    if (prior) {
      if (String(prior.body) !== body) throw new Error("Snapshot identity conflict");
      return JSON.parse(String(prior.body)) as StoredSnapshot;
    }
    if (Buffer.byteLength(body) > 20 * 1024 * 1024) throw new Error("Snapshot capacity exceeded");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // Other local processes can change consent or delete/re-register a
      // project while a sample is being sanitized. Recheck under the write lock.
      if (
        JSON.stringify(this.project(projectId)?.policy) !== JSON.stringify(project.policy) ||
        (expectedEpoch !== undefined && this.lifecycle(projectId).epoch !== expectedEpoch)
      )
        throw new Error("Capture consent changed before persistence");
      const used = this.projectBytes(projectId);
      if (used + Buffer.byteLength(body) > this.limits.maxBytes)
        throw new Error("Project storage limit reached");
      this.db
        .prepare("INSERT INTO snapshots(id,project_id,session_id,event_id,body) VALUES(?,?,?,?,?)")
        .run(clean.id, projectId, sessionId, eventId, body);
      this.append([
        {
          schemaVersion: 1,
          id: eventId,
          deliveryId: eventId,
          projectId,
          sessionId,
          source: project.synthetic ? "synthetic" : "repository",
          adapterVersion: "0.1.0",
          sourceLocator: clean.id,
          producerId: "repository-capture-v1",
          promptId: null,
          toolId: null,
          requestId: null,
          sourceTime: clean.capturedAt,
          sourceSequence: null,
          policyVersion: 1,
          payload: {
            kind: "repository_snapshot",
            snapshotId: clean.id,
            reason,
            state: clean.state,
            dirty: clean.dirty,
          },
        },
        ...observations,
      ]);
      this.db.exec("COMMIT");
      return stored;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  enableObservation(projectId: string): void {
    if (!this.repository(projectId) || this.lifecycle(projectId).purgedAt)
      throw new Error("Registered repository required");
    if (!this.observation(projectId).enabled && this.observationProjects().length >= 50)
      throw new Error("Automatic observation supports up to 50 repositories");
    this.db
      .prepare(
        "INSERT INTO repository_observation(project_id,enabled) VALUES(?,1) ON CONFLICT(project_id) DO UPDATE SET enabled=1,status='waiting'",
      )
      .run(projectId);
  }
  observation(projectId: string): ObservationStatus {
    const row = this.db
      .prepare("SELECT * FROM repository_observation WHERE project_id=?")
      .get(projectId);
    return {
      enabled: Boolean(row?.enabled),
      status: this.lifecycle(projectId).paused
        ? "paused"
        : ((row?.status ?? "waiting") as ObservationStatus["status"]),
      checkedAt: row?.checked_at == null ? null : String(row.checked_at),
      capturedAt: row?.captured_at == null ? null : String(row.captured_at),
    };
  }
  observationProjects(): string[] {
    return this.db
      .prepare("SELECT project_id FROM repository_observation WHERE enabled=1 ORDER BY project_id")
      .all()
      .map((row) => String(row.project_id));
  }
  updateObservation(
    projectId: string,
    status: ObservationStatus["status"],
    captured = false,
  ): void {
    this.db
      .prepare(
        "UPDATE repository_observation SET status=?,checked_at=?,captured_at=CASE WHEN ? THEN ? ELSE captured_at END WHERE project_id=?",
      )
      .run(status, new Date().toISOString(), Number(captured), new Date().toISOString(), projectId);
  }
  latestObservedSnapshot(projectId: string): StoredSnapshot | null {
    const row = this.db
      .prepare(
        "SELECT s.body FROM snapshots s WHERE s.project_id=? AND EXISTS (SELECT 1 FROM events e WHERE e.project_id=s.project_id AND e.session_id=s.session_id AND json_extract(e.body,'$.producerId')='repository-observer-v1') ORDER BY s.rowid DESC LIMIT 1",
      )
      .get(projectId);
    return row ? (JSON.parse(String(row.body)) as StoredSnapshot) : null;
  }
  latestRepositoryState(projectId: string): NormalizedEvent | null {
    const row = this.db
      .prepare(
        "SELECT body FROM events WHERE project_id=? AND json_extract(body,'$.producerId')='repository-observer-v1' AND json_extract(body,'$.payload.kind')='repository_state' ORDER BY sequence DESC LIMIT 1",
      )
      .get(projectId);
    return row ? this.event(row.body) : null;
  }
  repositoryHistory(projectId: string, sessionId: string) {
    const total = Number(
      this.db
        .prepare(
          "SELECT count(*) AS total FROM events WHERE project_id=? AND session_id=? AND json_extract(body,'$.payload.kind')='repository_state'",
        )
        .get(projectId, sessionId)?.total ?? 0,
    );
    const events: StoredEvent[] = this.db
      .prepare(
        "SELECT body,sequence,received_at FROM events WHERE project_id=? AND session_id=? AND json_extract(body,'$.payload.kind')='repository_state' ORDER BY sequence DESC LIMIT 50",
      )
      .all(projectId, sessionId)
      .map((row) => this.storedEvent(row));
    return { events, total, nextCursor: null };
  }
  snapshots(projectId: string, sessionId: string): StoredSnapshot[] {
    return this.db
      .prepare(
        "SELECT body FROM snapshots WHERE project_id=? AND session_id=? ORDER BY rowid LIMIT 100",
      )
      .all(projectId, sessionId)
      .map((row) => JSON.parse(String(row.body)) as StoredSnapshot);
  }
  snapshotSummaries(
    projectId: string,
    sessionId: string,
    cursor = 0,
    limit = 50,
    latest = false,
  ): SnapshotPage {
    if (
      !Number.isSafeInteger(cursor) ||
      cursor < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new Error("Invalid snapshot cursor");
    const rows = this.db
      .prepare(`SELECT rowid AS cursor, id, event_id,
      json_extract(body,'$.capturedAt') AS captured_at,
      json_extract(body,'$.head') AS head, json_extract(body,'$.indexIdentity') AS index_identity,
      json_extract(body,'$.reason') AS reason, json_extract(body,'$.state') AS state,
      json_extract(body,'$.dirty') AS dirty, json_extract(body,'$.omitted') AS omitted,
      json_array_length(body,'$.files') AS file_count, json_array_length(body,'$.warnings') AS warning_count
      FROM snapshots WHERE project_id=? AND session_id=? AND ${latest ? "(?=0 OR rowid<?)" : "rowid>?"} ORDER BY rowid ${latest ? "DESC" : "ASC"} LIMIT ?`)
      .all(projectId, sessionId, ...(latest ? [cursor, cursor] : [cursor]), limit + 1);
    const total = Number(
      this.db
        .prepare("SELECT count(*) AS total FROM snapshots WHERE project_id=? AND session_id=?")
        .get(projectId, sessionId)?.total ?? 0,
    );
    return {
      total,
      nextCursor: rows.length > limit ? Number(rows[limit - 1].cursor) : null,
      snapshots: rows.slice(0, limit).map((row) => ({
        id: String(row.id),
        projectId,
        sessionId,
        eventId: String(row.event_id),
        capturedAt: String(row.captured_at),
        head: row.head === null ? null : String(row.head),
        indexIdentity: row.index_identity === null ? null : String(row.index_identity),
        reason: row.reason as "baseline" | "checkpoint",
        state: row.state as "observed" | "racy",
        dirty: row.dirty === null ? null : Boolean(row.dirty),
        omitted: Number(row.omitted),
        fileCount: Number(row.file_count),
        warningCount: Number(row.warning_count),
      })),
    };
  }
  snapshot(projectId: string, id: string): StoredSnapshot | null {
    const row = this.db
      .prepare("SELECT body FROM snapshots WHERE project_id=? AND id=?")
      .get(projectId, id);
    return row ? (JSON.parse(String(row.body)) as StoredSnapshot) : null;
  }
  artifact(projectId: string, id: string, text: string): void {
    if (Buffer.byteLength(text) > 1048576) throw new Error("Artifact exceeds in-memory limit");
    const project = this.project(projectId);
    if (!project) throw new Error("Project not registered");
    const content = sanitizeContent(
      { text, state: "present", originalBytes: null, categories: ["code"] },
      project.policy,
    );
    const body = JSON.stringify(content);
    const ownTransaction = !this.db.isTransaction;
    if (ownTransaction) this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.projectBytes(projectId) + Buffer.byteLength(body) > this.limits.maxBytes)
        throw new Error("Project storage limit reached");
      this.db.prepare("INSERT INTO artifacts VALUES(?,?,?)").run(id, projectId, body);
      if (ownTransaction) this.db.exec("COMMIT");
    } catch (error) {
      if (ownTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close(): void {
    this.db.close();
  }
}
