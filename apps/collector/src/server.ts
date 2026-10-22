import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { relationships, usage } from "@traceframe/analysis";
import { batchSchema, MAX_BODY, safeId } from "@traceframe/schema";
import { Store } from "@traceframe/storage";
import { credential, initializeCredential, runtime } from "@traceframe/storage/runtime";
import { demoEvents, demoPolicy } from "../../../fixtures/demo";

export function startCollector(
  port = runtime().collectorPort,
  store = new Store(runtime().dbFile),
) {
  initializeCredential();
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
    if (++requests > 300) {
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
        send(200, { status: "ok", schemaVersion: 1, mode: "synthetic-demo", ...health });
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/projects") {
        send(200, store.projects());
        return;
      }
      // The demo endpoint registers ONLY our fixed synthetic project and policy.
      if (req.method === "POST" && url.pathname === "/v1/demo") {
        if (req.headers["content-length"] && Number(req.headers["content-length"]) > 0) {
          send(400, { error: "Demo seed takes no body" });
          return;
        }
        store.registerProject("demo-quoli", "quoli", true, demoPolicy);
        send(200, store.append(demoEvents()));
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
      const match = /^\/v1\/projects\/([^/]+)\/sessions(?:\/([^/]+)\/(events|summary))?$/.exec(
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
        if (match[3] === "summary") {
          const events = store.allEvents(project, session);
          send(200, {
            usage: usage(events),
            relationships: relationships(events),
            kindCounts: Object.fromEntries(
              ["prompt", "tool_call", "tool_result", "gap"].map((kind) => [
                kind,
                events.filter((e) => e.payload.kind === kind).length,
              ]),
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
  server.on("close", () => store.close());
  return server;
}
async function body(req: IncomingMessage, res: ServerResponse): Promise<string | null> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      res.writeHead(413);
      res.end(JSON.stringify({ error: "Request exceeds 1 MiB" }));
      req.resume();
      return null;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
