import { readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Project } from "../shared/model.ts";
import { codeMap } from "./code.ts";
import { Store } from "./db.ts";
import { gitState } from "./gitstate.ts";
import { infraMap } from "./infra.ts";
import { git, ingest } from "./ingest.ts";
import { deriveSession, summarizeSession } from "./sessions.ts";

const PORT = Number(process.env.QUOLI_PORT ?? 4400);
const HOST = "127.0.0.1";
const appRoot = resolve(fileURLToPath(import.meta.url), "../..");
const production = process.env.NODE_ENV === "production";

const store = new Store();
if (process.argv.includes("--demo")) {
  const { seedDemo } = await import("./demo.ts");
  seedDemo(store);
}

const listeners = new Set<ServerResponse>();
const broadcast = (data: object) => {
  for (const res of listeners) res.write(`data: ${JSON.stringify(data)}\n\n`);
};

function json(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
  return true;
}

async function body(req: IncomingMessage, limit = 4 * 1024 * 1024): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Only known project roots can be read, and only files inside them. */
function knownRoot(url: URL): string | null {
  const root = url.searchParams.get("root");
  return root && store.hasRoot(root) ? root : null;
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const path = url.pathname;
  if (req.method === "POST" && path === "/ingest") {
    // A JSON content type forces a CORS preflight, so web pages cannot post here.
    if (!req.headers["content-type"]?.startsWith("application/json")) return json(res, 415, {});
    try {
      const payload = JSON.parse(await body(req));
      if (ingest(store, payload)) broadcast({ type: "event", sessionId: payload.session_id });
      json(res, 202, {});
    } catch {
      json(res, 400, {});
    }
    return true;
  }
  if (req.method !== "GET") return false;
  if (path === "/api/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    listeners.add(res);
    req.on("close", () => listeners.delete(res));
    return true;
  }
  if (path === "/api/projects") {
    const projects: Project[] = store.roots().map((r) => ({
      root: r.root,
      name: basename(r.root),
      sessions: r.sessions,
      lastActivity: r.last,
    }));
    return json(res, 200, projects);
  }
  if (path === "/api/session") {
    const id = url.searchParams.get("id") ?? "";
    const detail = deriveSession(store.events(id), store.usage(id));
    return json(res, detail ? 200 : 404, detail);
  }
  if (!path.startsWith("/api/")) return false;
  const root = knownRoot(url);
  if (!root) return json(res, 404, { error: "Unknown project" });
  if (path === "/api/sessions") {
    const sessions = store
      .sessionIds(root)
      .map((id) => deriveSession(store.events(id), store.usage(id)))
      .filter((d) => d !== null)
      .map(summarizeSession);
    return json(res, 200, sessions);
  }
  if (path === "/api/code") return json(res, 200, codeMap(root));
  if (path === "/api/git") return json(res, 200, gitState(root));
  if (path === "/api/infra") return json(res, 200, infraMap(root));
  if (path === "/api/file") {
    const rel = normalize(url.searchParams.get("path") ?? "");
    const full = resolve(root, rel);
    if (rel.startsWith("..") || !full.startsWith(`${root}/`)) return json(res, 400, {});
    let content: string | null = null;
    try {
      if (statSync(full).size < 1024 * 1024) content = readFileSync(full, "utf8");
    } catch {}
    const diff = git(root, ["diff", "HEAD", "--", rel]) || null;
    return json(res, 200, { path: rel, content, diff });
  }
  return false;
}

function guard(req: IncomingMessage): boolean {
  // Rejects DNS-rebinding: only loopback host names may talk to this server.
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  return host === "127.0.0.1" || host === "localhost";
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const vite = production
  ? null
  : await (await import("vite")).createServer({
      configFile: join(appRoot, "vite.config.ts"),
      server: { middlewareMode: true, hmr: { port: PORT + 1 } },
      appType: "spa",
    });

const server = createServer(async (req, res) => {
  if (!guard(req)) return json(res, 403, { error: "Loopback only" });
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  try {
    if (await api(req, res, url)) return;
  } catch (error) {
    return json(res, 500, { error: String(error) });
  }
  if (vite) return vite.middlewares(req, res);
  const dist = join(appRoot, "dist");
  const file = normalize(join(dist, url.pathname));
  const target = file.startsWith(dist) && extname(file) ? file : join(dist, "index.html");
  try {
    res.writeHead(200, { "Content-Type": MIME[extname(target)] ?? "application/octet-stream" });
    res.end(readFileSync(target));
  } catch {
    json(res, 404, {});
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Quoli → http://${HOST}:${PORT}\n`);
  if (!store.roots().length) {
    console.log(
      "  No sessions yet. Run `pnpm connect /path/to/repo`, or `pnpm demo` to explore sample data.\n",
    );
  }
});
