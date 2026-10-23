import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { activity, reconcile, relationships, usage, verification } from "@traceframe/analysis";
import { batchSchema, eventQuerySchema, MAX_BODY, safeId } from "@traceframe/schema";
import { settingsUpdateSchema } from "@traceframe/schema/lifecycle";
import { Store } from "@traceframe/storage";
import { credential, initializeCredential, runtime } from "@traceframe/storage/runtime";
import { cleanupProjectSpool, purgeProjectSpool, spoolDepth } from "@traceframe/storage/spool";
import { demoEvents, demoPolicy } from "../../../fixtures/demo";
import { demoSnapshots } from "../../../fixtures/repository";
import { readChanges } from "./changes";
import { readMap } from "./map";
import { startRepositoryObserver } from "./observer";
import { otlpUsageEvents, readOtlpBody } from "./otel";

/** The project that reported telemetry belongs to. */
function telemetryProject(): string | null {
  const configured = process.env.TRACEFRAME_PROJECT_ID;
  if (configured && /^[a-zA-Z0-9_-]{1,100}$/.test(configured)) return configured;
  return null;
}

export function startCollector(
  port = runtime().collectorPort,
  store = new Store(runtime().dbFile),
) {
  initializeCredential();
  const observer = startRepositoryObserver(store, runtime().dataDir);
  const health = { rejected: 0, storageErrors: 0 };
  let windowStart = Date.now(),
    requests = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status: number, data: unknown) => {
      res.writeHead(status);
      res.end(JSON.stringify(data));
    };
    if (Date.now() - windowStart > 60_000) {
      windowStart = Date.now();
      requests = 0;
    }
    // A runaway local client is stopped, but the dashboard and its browser suite need headroom.
    if (++requests > 600) {
      send(429, { error: "Local request limit; retry in a minute" });
      return;
    }
    const localPort = req.socket.localPort;
    const allowedHosts = [`127.0.0.1:${localPort}`, `localhost:${localPort}`];
    if (
      !req.headers.host ||
      !allowedHosts.includes(req.headers.host) ||
      req.headers.origin ||
      (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "none")
    ) {
      health.rejected++;
      send(403, { error: "Local server-to-server requests only" });
      return;
    }
    const authorization = req.headers.authorization ?? "";
    let expected: string;
    try {
      expected = `Bearer ${credential()}`;
    } catch {
      send(503, { error: "Local credential unavailable. Check setup permissions." });
      return;
    }
    if (
      Buffer.byteLength(authorization) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))
    ) {
      health.rejected++;
      send(401, { error: "Local credential required" });
      return;
    }
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (req.method === "GET" && url.pathname === "/health") {
        send(200, {
          status: "ok",
          schemaVersion: 1,
          mode: "local-preview",
          // Observations waiting in the bridge retry spool are capture loss.
          spooled: spoolDepth(),
          ...health,
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/projects") {
        send(200, store.projects());
        return;
      }
      const observationMatch = /^\/v1\/projects\/([^/]+)\/observation$/.exec(url.pathname);
      if (req.method === "GET" && observationMatch) {
        const project = safeId.parse(observationMatch[1]);
        if (!store.project(project)) {
          send(404, { error: "Unknown project" });
          return;
        }
        send(200, store.observation(project));
        return;
      }
      // The demo endpoint registers ONLY our fixed synthetic project and policy.
      if (req.method === "POST" && url.pathname === "/v1/demo") {
        if (req.headers["content-length"] && Number(req.headers["content-length"]) > 0) {
          send(400, { error: "Demo seed takes no body" });
          return;
        }
        store.registerProject("demo-quoli", "quoli", true, demoPolicy);
        const result = store.append(demoEvents());
        for (const { sessionId, reason, snapshot } of demoSnapshots()) {
          const existing = store.snapshot("demo-quoli", snapshot.id);
          store.appendSnapshot("demo-quoli", sessionId, snapshot, reason);
          if (existing) result.duplicates++;
          else result.accepted++;
        }
        send(200, result);
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/logs") {
        // Narrow local OTLP logs receiver for reported usage.
        if (!req.headers["content-type"]?.startsWith("application/json")) {
          send(415, { error: "Use the http/json OTLP encoding" });
          return;
        }
        const text = await body(req, res, 8 * 1024 * 1024);
        if (text === null) return;
        const parsed = readOtlpBody(text);
        if (!parsed) {
          send(400, { error: "Invalid OTLP logs body" });
          return;
        }
        const projectId = telemetryProject();
        if (!projectId) {
          send(409, { error: "Set TRACEFRAME_PROJECT_ID for the reported usage project" });
          return;
        }
        const events = otlpUsageEvents(parsed, projectId);
        if (!events.length) {
          send(200, {});
          return;
        }
        try {
          store.append(events);
        } catch {
          health.storageErrors++;
          send(409, { error: "Reported usage was not persisted" });
          return;
        }
        send(200, {});
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/ingest") {
        if (req.headers["content-type"] !== "application/json") {
          send(415, { error: "Use application/json" });
          return;
        }
        const text = await body(req, res);
        if (text === null) return;
        const parsed = batchSchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
          health.rejected++;
          send(400, { error: "Invalid event batch or unsupported schema version" });
          return;
        }
        send(200, store.append(parsed.data.events));
        return;
      }
      const countsMatch = /^\/v1\/projects\/([^/]+)\/session-counts$/.exec(url.pathname);
      if (req.method === "GET" && countsMatch) {
        const project = safeId.parse(countsMatch[1]);
        if (!store.project(project)) {
          send(404, { error: "Unknown project" });
          return;
        }
        send(200, store.sessionCounts(project));
        return;
      }
      const settingsMatch = /^\/v1\/projects\/([^/]+)\/settings$/.exec(url.pathname);
      if (settingsMatch && (req.method === "GET" || req.method === "POST")) {
        const project = safeId.parse(settingsMatch[1]);
        if (!store.project(project)) {
          send(404, { error: "Unknown project" });
          return;
        }
        if (req.method === "GET") {
          const settings = store.settings(project);
          send(200, {
            projectId: project,
            name: settings.project.name,
            synthetic: settings.project.synthetic,
            policy: settings.project.policy,
            paused: settings.paused,
            retentionDays: settings.retentionDays,
            purged: settings.purgedAt !== null,
            purgedAt: settings.purgedAt,
            epoch: settings.epoch,
            usage: settings.usage,
          });
          return;
        }
        if (req.headers["content-type"] !== "application/json") {
          send(415, { error: "Use application/json" });
          return;
        }
        const text = await body(req, res);
        if (text === null) return;
        const update = settingsUpdateSchema.parse(JSON.parse(text));
        store.updateSettings(project, update);
        const settings = store.settings(project);
        // Pending retries follow the same policy and retention window; content
        // that just became disallowed must not survive in the spool. The state
        // change is already committed, so a spool failure must not report it as
        // failed; the generation and drain fence still apply.
        try {
          cleanupProjectSpool(project, settings.project.policy, settings.retentionDays);
        } catch {
          health.storageErrors++;
        }
        send(200, {
          projectId: project,
          name: settings.project.name,
          synthetic: settings.project.synthetic,
          policy: settings.project.policy,
          paused: settings.paused,
          retentionDays: settings.retentionDays,
          purged: settings.purgedAt !== null,
          purgedAt: settings.purgedAt,
          epoch: settings.epoch,
          usage: settings.usage,
        });
        return;
      }
      const purgeMatch = /^\/v1\/projects\/([^/]+)\/purge$/.exec(url.pathname);
      if (req.method === "POST" && purgeMatch) {
        const project = safeId.parse(purgeMatch[1]);
        const result = store.purgeProject(project);
        // The tombstone fences future retries; the cleanup removes the ones
        // already waiting, so a re-registration cannot bring them back. The
        // deletion is already committed, so spool cleanup is best-effort and
        // must not turn a successful deletion into an error response.
        try {
          purgeProjectSpool(project);
        } catch {
          health.storageErrors++;
        }
        send(200, { projectId: project, ...result });
        return;
      }
      const changesMatch = /^\/v1\/projects\/([^/]+)\/sessions\/([^/]+)\/changes$/.exec(
        url.pathname,
      );
      if (req.method === "POST" && changesMatch) {
        const project = safeId.parse(changesMatch[1]),
          session = safeId.parse(changesMatch[2]);
        if (
          !store.project(project) ||
          !store.sessions(project).some((item) => item.id === session)
        ) {
          send(404, { error: "Unknown project or session" });
          return;
        }
        if (req.headers["content-type"] !== "application/json") {
          send(415, { error: "Use application/json" });
          return;
        }
        const text = await body(req, res);
        if (text === null) return;
        const result = readChanges(store, project, session, JSON.parse(text));
        send(result.status, result.data);
        return;
      }
      const mapMatch = /^\/v1\/projects\/([^/]+)\/sessions\/([^/]+)\/map$/.exec(url.pathname);
      if (req.method === "POST" && mapMatch) {
        const project = safeId.parse(mapMatch[1]),
          session = safeId.parse(mapMatch[2]);
        if (
          !store.project(project) ||
          !store.sessions(project).some((item) => item.id === session)
        ) {
          send(404, { error: "Unknown project or session" });
          return;
        }
        if (req.headers["content-type"] !== "application/json") {
          send(415, { error: "Use application/json" });
          return;
        }
        const text = await body(req, res);
        if (text === null) return;
        const result = readMap(store, project, session, JSON.parse(text));
        send(result.status, result.data);
        return;
      }
      const queryMatch = /^\/v1\/projects\/([^/]+)\/sessions\/([^/]+)\/events\/query$/.exec(
        url.pathname,
      );
      if (req.method === "POST" && queryMatch) {
        const project = safeId.parse(queryMatch[1]),
          session = safeId.parse(queryMatch[2]);
        if (!store.project(project) || !store.sessions(project).some((s) => s.id === session)) {
          send(404, { error: "Unknown project or session" });
          return;
        }
        if (req.headers["content-type"] !== "application/json") {
          send(415, { error: "Use application/json" });
          return;
        }
        const text = await body(req, res);
        if (text === null) return;
        const query = eventQuerySchema.parse(JSON.parse(text));
        send(200, store.events(project, session, query.cursor, 8, query));
        return;
      }
      const match =
        /^\/v1\/projects\/([^/]+)\/sessions(?:\/([^/]+)\/(events|summary|snapshots|repository-history))?$/.exec(
          url.pathname,
        );
      if (req.method === "GET" && match) {
        const project = safeId.parse(match[1]);
        if (!store.project(project)) {
          send(404, { error: "Unknown project" });
          return;
        }
        if (!match[2]) {
          send(200, store.sessions(project));
          return;
        }
        const session = safeId.parse(match[2]);
        if (!store.sessions(project).some((s) => s.id === session)) {
          send(404, { error: "Unknown session" });
          return;
        }
        if (match[3] === "repository-history") {
          send(200, store.repositoryHistory(project, session));
          return;
        }
        if (match[3] === "snapshots") {
          const cursor = Number(url.searchParams.get("cursor") ?? 0);
          if (!Number.isSafeInteger(cursor) || cursor < 0) {
            send(400, { error: "Invalid snapshot cursor" });
            return;
          }
          const order = url.searchParams.get("order") ?? "receipt";
          if (order !== "receipt" && order !== "latest") {
            send(400, { error: "Invalid capture order" });
            return;
          }
          send(200, store.snapshotSummaries(project, session, cursor, 50, order === "latest"));
          return;
        }
        if (match[3] === "summary") {
          const events = store.allEvents(project, session);
          const usageView = usage(events);
          send(200, {
            usage: usageView,
            relationships: relationships(events),
            activity: activity(events),
            verification: verification(events),
            reconciliation: reconcile(events, usageView),
            kindCounts: Object.fromEntries(
              [
                "prompt",
                "tool_call",
                "tool_result",
                "gap",
                "repository_snapshot",
                "repository_state",
              ].map((kind) => [kind, events.filter((e) => e.payload.kind === kind).length]),
            ),
          });
          return;
        }
        if (url.searchParams.has("event")) {
          const id = safeId.parse(url.searchParams.get("event"));
          const event = store.allEvents(project, session).find((e) => e.id === id);
          send(
            event ? 200 : 404,
            event ? { events: [event], nextCursor: null, total: 1 } : { error: "Unknown evidence" },
          );
          return;
        }
        const cursor = Number(url.searchParams.get("cursor") ?? 0);
        if (!Number.isSafeInteger(cursor) || cursor < 0) {
          send(400, { error: "Invalid cursor" });
          return;
        }
        send(200, store.events(project, session, cursor));
        return;
      }
      send(404, { error: "Unknown endpoint" });
    } catch (error) {
      // Never serialize exception messages: schema errors can contain captured content.
      if (error instanceof SyntaxError || (error as { name?: string }).name === "ZodError") {
        health.rejected++;
        send(400, { error: "Malformed request" });
      } else {
        health.storageErrors++;
        send(409, {
          error:
            "Batch not persisted: identity conflict, project not registered, or local storage unavailable",
        });
      }
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.listen(port, "127.0.0.1");
  server.on("close", () => {
    void observer.stop().finally(() => store.close());
  });
  return server;
}
async function body(
  req: IncomingMessage,
  res: ServerResponse,
  limit = MAX_BODY,
): Promise<string | null> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      res.writeHead(413);
      res.end(JSON.stringify({ error: `Request exceeds ${Math.round(limit / 1024 / 1024)} MiB` }));
      req.resume();
      return null;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
