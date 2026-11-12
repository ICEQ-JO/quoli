import { readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Overview,
  PriceTable,
  Project,
  SessionDetail,
  SessionSummary,
  Settings,
} from "../shared/model.ts";
import { codeMap } from "./code.ts";
import { connect, hooksInstalled, validateRepo } from "./connect.ts";
import { home, projectId, type Store } from "./db.ts";
import { gitState, parseLimit } from "./gitstate.ts";
import { infraMap } from "./infra.ts";
import { git, ingest, redact } from "./ingest.ts";
import {
  costOf,
  defaultPrices,
  loadPrices,
  resetPrices,
  savePrices,
  validatePrices,
} from "./prices.ts";
import { deriveSession, summarizeSession } from "./sessions.ts";

const version: string = JSON.parse(
  readFileSync(resolve(fileURLToPath(import.meta.url), "../../package.json"), "utf8"),
).version;

const DAY = 86_400_000;

export function json(res: ServerResponse, status: number, body: unknown): true {
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

class BadRequest extends Error {}

/** Whole sessions older than the retention window are deleted. Returns how many. */
export function applyRetention(store: Store, now = Date.now()): number {
  const days = store.settings().retentionDays;
  if (days === null) return 0;
  const ids = store.staleSessionIds(new Date(now - days * DAY).toISOString());
  if (!ids.length) return 0;
  return store.deleteSessions(ids).sessions;
}

/** Validates a settings update; throws BadRequest with a readable message. */
export function mergeSettings(current: Settings, input: unknown): Settings {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BadRequest("Settings must be an object");
  }
  const next = { ...current };
  for (const [key, value] of Object.entries(input)) {
    if (key === "retentionDays") {
      if (value !== null && !(Number.isInteger(value) && value >= 1 && value <= 3650)) {
        throw new BadRequest("retentionDays must be null or a whole number from 1 to 3650");
      }
      next.retentionDays = value as number | null;
    } else if (key === "redact") {
      if (typeof value !== "boolean") throw new BadRequest("redact must be true or false");
      next.redact = value;
    } else {
      throw new BadRequest(`Unknown setting: ${key}`);
    }
  }
  return next;
}

/** The product's HTTP API. `port` is read per request so tests can listen on port 0. */
export function createApp(store: Store, port: () => number) {
  const listeners = new Set<ServerResponse>();
  const broadcast = (data: object) => {
    for (const res of listeners) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const hasRoot = (root: string) => store.hasRoot(root) || store.isRegistered(root);

  function projects(): Project[] {
    const registered = new Map(store.registeredProjects().map((p) => [p.root, p.connectedAt]));
    const seen = new Map(store.roots().map((r) => [r.root, r]));
    const roots = new Set([...registered.keys(), ...seen.keys()]);
    return [...roots]
      .map((root): Project => {
        const info = seen.get(root);
        const installed = hooksInstalled(root);
        return {
          id: projectId(root),
          root,
          name: basename(root),
          sessions: info?.sessions ?? 0,
          lastActivity: info?.last ?? null,
          hookStatus: installed ? (info ? "receiving" : "installed") : "not_connected",
          connectedAt: registered.get(root) ?? null,
        };
      })
      .sort(
        (a, b) =>
          (b.lastActivity ?? b.connectedAt ?? "").localeCompare(
            a.lastActivity ?? a.connectedAt ?? "",
          ) || a.name.localeCompare(b.name),
      );
  }

  const details = (ids: string[]) => {
    const prices = loadPrices(store);
    return ids
      .map((id) => deriveSession(store.events(id), store.usage(id), prices))
      .filter((d): d is SessionDetail => d !== null);
  };

  function overview(): Overview {
    const now = Date.now();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const prices = loadPrices(store);
    const all = details(store.recentSessionIds(500));
    const week = new Date(now - 7 * DAY).toISOString();
    const needsReview = all
      .filter((d) => !d.live && d.startedAt >= week)
      .map((d) => ({ session: summarizeSession(d), reasons: reviewReasons(d) }))
      .filter((r) => r.reasons.length)
      .slice(0, 20);
    return {
      live: all.filter((d) => d.live).map(summarizeSession),
      needsReview,
      recent: all.slice(0, 10).map(summarizeSession),
      tokens: {
        today: store.tokensSince(startOfDay.toISOString()),
        week: store.tokensSince(week),
      },
      cost: {
        today: costOf(store.usageByModelSince(startOfDay.toISOString()), prices),
        week: costOf(store.usageByModelSince(week), prices),
      },
      counts: {
        projects: projects().length,
        sessions: store.sessionCount(),
        sessionsToday: store.sessionCount(startOfDay.toISOString()),
      },
    };
  }

  const settingsResponse = () => ({
    settings: store.settings(),
    info: { dataDir: home(), port: port(), version },
  });

  function removeProject(root: string) {
    connect(root, true);
  }

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "POST" && path === "/ingest") {
      // A JSON content type forces a CORS preflight, so web pages cannot post here.
      if (!req.headers["content-type"]?.startsWith("application/json")) return json(res, 415, {});
      try {
        const payload = JSON.parse(await body(req));
        const changed = () => broadcast({ type: "projects" });
        if (ingest(store, payload, undefined, changed)) {
          broadcast({ type: "event", sessionId: payload.session_id });
        }
        json(res, 202, {});
      } catch {
        json(res, 400, {});
      }
      return true;
    }

    if (path.startsWith("/api/") && method !== "GET") {
      const own = [`http://127.0.0.1:${port()}`, `http://localhost:${port()}`];
      const origin = req.headers.origin;
      if (typeof origin !== "string" || !own.includes(origin)) {
        return json(res, 403, { error: "Cross-origin request refused" });
      }
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        return json(res, 403, { error: "Content-Type must be application/json" });
      }
      try {
        return await mutate(req, res, method, path);
      } catch (error) {
        if (error instanceof BadRequest) return json(res, 400, { error: error.message });
        throw error;
      }
    }

    if (method !== "GET") return false;
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
    if (path === "/api/projects") return json(res, 200, projects());
    if (path === "/api/overview") return json(res, 200, overview());
    if (path === "/api/settings") return json(res, 200, settingsResponse());
    if (path === "/api/prices") return json(res, 200, loadPrices(store));
    if (path === "/api/session") {
      const id = url.searchParams.get("id") ?? "";
      const detail = deriveSession(store.events(id), store.usage(id), loadPrices(store));
      return json(res, detail ? 200 : 404, detail);
    }
    if (path === "/api/sessions") {
      const wanted = url.searchParams.get("project");
      let ids: string[];
      if (wanted) {
        const project = projects().find((p) => p.id === wanted);
        if (!project) return json(res, 404, { error: "Unknown project" });
        ids = store.sessionIds(project.root);
      } else {
        ids = store.recentSessionIds(500);
      }
      const sessions: SessionSummary[] = details(ids).map(summarizeSession);
      return json(res, 200, sessions);
    }
    if (!path.startsWith("/api/")) return false;
    // Only known project roots can be read, and only files inside them.
    const root = url.searchParams.get("root");
    if (!root || !hasRoot(root)) return json(res, 404, { error: "Unknown project" });
    if (path === "/api/code") return json(res, 200, codeMap(root));
    if (path === "/api/git") {
      const limit = parseLimit(url.searchParams.get("limit"));
      return json(res, 200, gitState(root, limit, details(store.sessionIds(root))));
    }
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

  async function mutate(
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    path: string,
  ): Promise<boolean> {
    const payload = async (): Promise<Record<string, unknown>> => {
      let data: unknown;
      try {
        data = JSON.parse((await body(req)) || "{}");
      } catch {
        throw new BadRequest("Body must be valid JSON");
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new BadRequest("Body must be a JSON object");
      }
      return data as Record<string, unknown>;
    };
    const projectFor = (id: string) => projects().find((p) => p.id === id);

    if (method === "POST" && path === "/api/projects") {
      const { path: repo } = await payload();
      let root: string;
      try {
        root = validateRepo(repo);
      } catch (error) {
        throw new BadRequest((error as Error).message);
      }
      connect(root);
      store.registerProject(root);
      broadcast({ type: "projects" });
      return json(res, 200, projectFor(projectId(root)));
    }
    const m = path.match(/^\/api\/projects\/([0-9a-f]{12})(\/disconnect)?$/);
    if (m) {
      const project = projectFor(m[1]);
      if (!project) return json(res, 404, { error: "Unknown project" });
      if (method === "POST" && m[2]) {
        removeProject(project.root);
        broadcast({ type: "projects" });
        return json(res, 200, projectFor(project.id));
      }
      if (method === "DELETE" && !m[2]) {
        removeProject(project.root);
        const removed = store.deleteSessions(store.rootSessionIds(project.root));
        store.unregisterProject(project.root);
        store.checkpoint();
        broadcast({ type: "projects" });
        return json(res, 200, removed);
      }
    }
    if (method === "PUT" && path === "/api/settings") {
      store.saveSettings(mergeSettings(store.settings(), await payload()));
      applyRetention(store);
      broadcast({ type: "projects" });
      return json(res, 200, settingsResponse());
    }
    if (method === "PUT" && path === "/api/prices") {
      let table: PriceTable;
      try {
        table = validatePrices(await payload());
      } catch (error) {
        throw new BadRequest((error as Error).message);
      }
      savePrices(store, table);
      broadcast({ type: "projects" });
      return json(res, 200, loadPrices(store));
    }
    if (method === "DELETE" && path === "/api/prices") {
      resetPrices(store);
      broadcast({ type: "projects" });
      return json(res, 200, defaultPrices());
    }
    if (method === "POST" && path === "/api/redact-preview") {
      const { text } = await payload();
      if (typeof text !== "string") throw new BadRequest("text must be a string");
      return json(res, 200, { text: redact(text.slice(0, 20_000)) });
    }
    return json(res, 404, { error: "Not found" });
  }

  return { api, broadcast };
}

/** Plain-sentence, derived reasons to look at a session again. Never a claim of correctness. */
export function reviewReasons(d: SessionDetail): string[] {
  const reasons: string[] = [];
  if (d.failures > 0)
    reasons.push(`${d.failures} failed tool ${d.failures === 1 ? "call" : "calls"}`);
  const changed = Object.values(d.files).filter((f) => f.edited > 0).length;
  if (changed >= 10) reasons.push(`${changed} files changed`);
  const lastEdit = d.toolCalls.findLastIndex((c) => c.category === "edit");
  if (lastEdit >= 0 && !d.toolCalls.slice(lastEdit + 1).some((c) => c.category === "run")) {
    reasons.push("No command was run after the last edit");
  }
  return reasons;
}
