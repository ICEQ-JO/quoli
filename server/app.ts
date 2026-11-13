import { readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, isAbsolute, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAgentKind,
  type Overview,
  type PriceTable,
  type Project,
  type SessionDetail,
  type SessionSummary,
  type Settings,
} from "../shared/model.ts";
import { codeMap } from "./code.ts";
import { codeGraphFor, scopeGraph } from "./codegraph/index.ts";
import { connect, HOOK_AGENTS, type HookAgent, installedAgents, validateRepo } from "./connect.ts";
import { home, projectId, type Store } from "./db.ts";
import { githubRepo } from "./github.ts";
import { commitDetail, gitState, parseLimit } from "./gitstate.ts";
import { infraMap } from "./infra.ts";
import { git, ingest, redact } from "./ingest.ts";
import { insightsReport } from "./insights.ts";
import { saveLinkedKey, startLink, waitForLink } from "./link.ts";
import { liveStatusOf, updateLivePrices } from "./liveprices.ts";
import { addManual, loadManual, mergeManual, saveManual, validateManual } from "./manual.ts";
import {
  costOf,
  defaultPrices,
  effectivePrices,
  loadPrices,
  resetPrices,
  savePrices,
  validatePrices,
} from "./prices.ts";
import { buildReview, reviewDiff } from "./review.ts";
import { searchEvents } from "./search.ts";
import { deriveSession, isLive, summarizeSession } from "./sessions.ts";
import { detectedAgents, isSetUp, setup, setupStatus } from "./setup.ts";
import { liveSession } from "./steps.ts";
import { HOSTED, loadSync, saveSync, syncOnce, syncStatus } from "./sync.ts";
import { usageReport } from "./usage.ts";

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
    } else if (key === "budgetDailyUsd" || key === "budgetMonthlyUsd") {
      if (value !== null && !(typeof value === "number" && value > 0 && value <= 1_000_000)) {
        throw new BadRequest(`${key} must be null or a number above 0 and at most 1000000`);
      }
      next[key] = value as number | null;
    } else if (key === "livePrices") {
      if (typeof value !== "boolean") throw new BadRequest("livePrices must be true or false");
      next.livePrices = value;
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
  // Live updates: a numbered feed of recent changes that pages poll (GET /api/changes). Polling
  // instead of a held connection: browsers allow six connections per address, so a stream per
  // tab left a seventh tab, or a reload, waiting forever.
  let seq = 0;
  const recent: { seq: number; data: object }[] = [];
  const broadcast = (data: object) => {
    recent.push({ seq: ++seq, data });
    if (recent.length > 200) recent.shift();
  };
  /** Changes after `after`; a page that missed some (or a restarted server) reloads everything. */
  const changesAfter = (after: number) => {
    if (!Number.isInteger(after) || after < 0) return { seq, changes: [] };
    if (after > seq || (recent.length && after < recent[0].seq - 1)) {
      return { seq, changes: [{ type: "projects" }] };
    }
    return { seq, changes: recent.filter((c) => c.seq > after).map((c) => c.data) };
  };

  const hasRoot = (root: string) => store.hasRoot(root) || store.isRegistered(root);

  function projects(): Project[] {
    const registered = new Map(store.registeredProjects().map((p) => [p.root, p.connectedAt]));
    const seen = new Map(store.roots().map((r) => [r.root, r]));
    const roots = new Set([...registered.keys(), ...seen.keys()]);
    // Agents set up once for the user (pnpm quoli-setup) record every repository.
    const everywhere = HOOK_AGENTS.filter(isSetUp);
    return [...roots]
      .map((root): Project => {
        const info = seen.get(root);
        const here = installedAgents(root);
        const agents = HOOK_AGENTS.filter((a) => here.includes(a) || everywhere.includes(a)).map(
          (agent) => ({
            agent,
            everywhere: !here.includes(agent),
            status: store.hasAgentEvents(root, agent)
              ? ("receiving" as const)
              : ("installed" as const),
          }),
        );
        const installed = agents.length > 0;
        return {
          id: projectId(root),
          root,
          name: basename(root),
          sessions: info?.sessions ?? 0,
          lastActivity: info?.last ?? null,
          hookStatus: installed ? (info ? "receiving" : "installed") : "not_connected",
          agents,
          connectedAt: registered.get(root) ?? null,
          github: githubRepo(root),
        };
      })
      .sort(
        (a, b) =>
          (b.lastActivity ?? b.connectedAt ?? "").localeCompare(
            a.lastActivity ?? a.connectedAt ?? "",
          ) || a.name.localeCompare(b.name),
      );
  }

  // Derived sessions are reused until the session is written to or the price table changes.
  // Without this, every hook event re-read and re-derived up to 500 sessions for Home.
  const cache = new Map<
    string,
    { revision: number; prices: string; lastAt: string; detail: SessionDetail }
  >();
  const derive = (id: string, prices: PriceTable, pricesKey: string): SessionDetail | null => {
    const revision = store.revision(id);
    const hit = cache.get(id);
    if (hit && hit.revision === revision && hit.prices === pricesKey) {
      return { ...hit.detail, live: isLive(hit.detail.endedAt, hit.lastAt) };
    }
    const events = store.events(id);
    const detail = deriveSession(events, store.usage(id), prices);
    if (detail) {
      cache.set(id, { revision, prices: pricesKey, lastAt: events.at(-1)?.at ?? "", detail });
    } else cache.delete(id);
    return detail;
  };
  const details = (ids: string[]) => {
    const prices = effectivePrices(store);
    const key = JSON.stringify(prices);
    return ids.map((id) => derive(id, prices, key)).filter((d): d is SessionDetail => d !== null);
  };

  function overview(): Overview {
    const now = Date.now();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const prices = effectivePrices(store);
    const all = details(store.recentSessionIds(500));
    const week = new Date(now - 7 * DAY).toISOString();
    const needsReview = all
      .filter((d) => !d.live && d.startedAt >= week)
      .map((d) => ({ session: summarizeSession(d), reasons: reviewReasons(d) }))
      .filter((r) => r.reasons.length)
      .slice(0, 20);
    return {
      live: all.filter((d) => d.live).map((d) => liveSession(d, prices, now)),
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
    for (const agent of HOOK_AGENTS) connect(root, true, agent);
  }

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (method === "POST" && path === "/ingest") {
      // A JSON content type forces a CORS preflight, so web pages cannot post here.
      if (!req.headers["content-type"]?.startsWith("application/json")) return json(res, 415, {});
      try {
        const agent = url.searchParams.get("agent") ?? "claude-code";
        if (!isAgentKind(agent)) return json(res, 400, { error: "Unknown agent" });
        const payload = JSON.parse(await body(req));
        const changed = () => broadcast({ type: "projects" });
        const sessionId = ingest(store, payload, undefined, changed, agent);
        if (sessionId) broadcast({ type: "event", sessionId });
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
    if (path === "/api/changes") {
      return json(res, 200, changesAfter(Number(url.searchParams.get("after") ?? -1)));
    }
    if (path === "/api/projects") return json(res, 200, projects());
    if (path === "/api/setup") return json(res, 200, setupStatus());
    if (path === "/api/overview") return json(res, 200, overview());
    if (path === "/api/settings") return json(res, 200, settingsResponse());
    if (path === "/api/prices") return json(res, 200, loadPrices(store));
    if (path === "/api/sync") return json(res, 200, syncState());
    if (path === "/api/prices/live") {
      return json(res, 200, liveStatusOf(store.settings().livePrices));
    }
    if (path === "/api/usage") {
      const days = Number(url.searchParams.get("days") ?? 30);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return json(res, 400, { error: "days must be a whole number from 1 to 365" });
      }
      const agent = url.searchParams.get("agent");
      if (agent !== null && !isAgentKind(agent)) return json(res, 400, { error: "Unknown agent" });
      return json(res, 200, usageReport(store, days, details, new Date(), agent));
    }
    if (path === "/api/insights") {
      const q = url.searchParams;
      const days = Number(q.get("days") ?? 30);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return json(res, 400, { error: "days must be a whole number from 1 to 365" });
      }
      const agent = q.get("agent");
      if (agent !== null && !isAgentKind(agent)) return json(res, 400, { error: "Unknown agent" });
      // One day of slack so a session that started just before local midnight is still read.
      const from = new Date(Date.now() - (days + 1) * DAY).toISOString();
      return json(
        res,
        200,
        insightsReport(details(store.sessionIdsStartedSince(from)), days, new Date(), {
          projectId: q.get("project"),
          agent,
          model: q.get("model"),
        }),
      );
    }
    if (path === "/api/session") {
      const id = url.searchParams.get("id") ?? "";
      const [detail = null] = details([id]);
      return json(res, detail ? 200 : 404, detail);
    }
    if (path === "/api/review" || path === "/api/review/diff") {
      const [detail = null] = details([url.searchParams.get("id") ?? ""]);
      if (!detail) return json(res, 404, { error: "Unknown session" });
      const known = hasRoot(detail.root);
      if (path === "/api/review") return json(res, 200, buildReview(detail, known));
      const rel = normalize(url.searchParams.get("path") ?? "");
      if (!rel || rel.startsWith("..") || isAbsolute(rel))
        return json(res, 400, { error: "Bad path" });
      const diff = reviewDiff(detail, rel, known);
      return diff
        ? json(res, 200, diff)
        : json(res, 404, { error: "The repository is not available" });
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
    if (path === "/api/search") {
      const project = projects().find((p) => p.id === url.searchParams.get("project"));
      if (!project) return json(res, 404, { error: "Unknown project" });
      const recent = details(store.sessionIds(project.root).slice(0, 60));
      return json(res, 200, searchEvents(recent, url.searchParams.get("q") ?? ""));
    }
    const graphRoute = /^\/api\/projects\/([^/]+)\/codegraph$/.exec(path);
    if (graphRoute) {
      const project = projects().find((p) => p.id === graphRoute[1]);
      if (!project) return json(res, 404, { error: "Unknown project" });
      const state = codeGraphFor(project.id, project.root);
      if (!state.graph) {
        return state.error
          ? json(res, 500, { error: state.error })
          : json(res, 202, { status: "building" });
      }
      const prefix = url.searchParams.get("path");
      return json(res, 200, prefix ? scopeGraph(state.graph, prefix) : state.graph);
    }
    if (!path.startsWith("/api/")) return false;
    // Only known project roots can be read, and only files inside them.
    const root = url.searchParams.get("root");
    if (!root || !hasRoot(root)) return json(res, 404, { error: "Unknown project" });
    if (path === "/api/code") return json(res, 200, codeMap(root));
    if (path === "/api/git") {
      const limit = parseLimit(url.searchParams.get("limit"));
      return json(res, 200, gitState(root, limit, details(store.commitSessionIds(root))));
    }
    if (path === "/api/commit") {
      const detail = commitDetail(root, url.searchParams.get("sha") ?? "");
      return detail ? json(res, 200, detail) : json(res, 404, { error: "Unknown commit" });
    }
    if (path === "/api/infra")
      return json(res, 200, mergeManual(infraMap(root), loadManual(store, projectId(root))));
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
      const { path: repo, agents } = await payload();
      const chosen: unknown = agents === undefined ? ["claude-code"] : agents;
      const valid = (v: unknown): v is HookAgent[] =>
        Array.isArray(v) && v.length > 0 && v.every((a) => HOOK_AGENTS.includes(a));
      if (!valid(chosen)) {
        throw new BadRequest(`agents must list one or more of: ${HOOK_AGENTS.join(", ")}`);
      }
      let root: string;
      try {
        root = validateRepo(repo);
      } catch (error) {
        throw new BadRequest((error as Error).message);
      }
      try {
        for (const agent of new Set(chosen)) connect(root, false, agent);
      } catch (error) {
        throw new BadRequest((error as Error).message);
      }
      store.registerProject(root);
      broadcast({ type: "projects" });
      return json(res, 200, projectFor(projectId(root)));
    }
    if (method === "PUT" && path === "/api/sync") {
      const { enabled, key } = await payload();
      const c = loadSync(store);
      if (key !== undefined) {
        if (key !== "" && !(typeof key === "string" && /^qk_[0-9a-f]{48}$/.test(key.trim()))) {
          throw new BadRequest(
            "That is not a sync key: copy it from your Quoli account at iceq.best/app (qk_…)",
          );
        }
        c.key = (key as string).trim();
        c.lastError = null;
      }
      if (enabled !== undefined) {
        if (typeof enabled !== "boolean") throw new BadRequest("enabled must be true or false");
        if (enabled && !c.key) throw new BadRequest("Add your sync key first");
        if (enabled && !c.enabled) c.since = new Date().toISOString();
        c.enabled = enabled;
      }
      if (!c.key) c.enabled = false;
      saveSync(store, c);
      if (c.enabled) void sync();
      return json(res, 200, syncState());
    }
    if (method === "POST" && path === "/api/sync/connect") {
      // Settings → Team sync → Connect: the same browser approval as `quoli connect` (#154).
      if (!HOSTED.url || !HOSTED.anonKey) throw new BadRequest("No account service to connect to");
      let link: Awaited<ReturnType<typeof startLink>>;
      try {
        link = await startLink(HOSTED);
      } catch (error) {
        throw new BadRequest(error instanceof Error ? error.message : String(error));
      }
      const mine = { pair: link.pair, url: link.url, error: null as string | null };
      linking = mine;
      waitForLink(HOSTED, link, { isCancelled: () => linking !== mine }).then(
        (key) => {
          saveLinkedKey(store, key);
          if (linking === mine) linking = null;
          void sync();
        },
        (error) => {
          if (linking === mine) mine.error = error instanceof Error ? error.message : String(error);
        },
      );
      return json(res, 200, syncState());
    }
    if (method === "DELETE" && path === "/api/sync/connect") {
      linking = null;
      return json(res, 200, syncState());
    }
    if (method === "POST" && path === "/api/setup") {
      const { agents, remove } = await payload();
      if (
        agents !== undefined &&
        (!Array.isArray(agents) || !agents.every((a) => HOOK_AGENTS.includes(a)))
      ) {
        throw new BadRequest(`agents must list some of: ${HOOK_AGENTS.join(", ")}`);
      }
      const chosen =
        (agents as HookAgent[] | undefined) ?? (remove ? HOOK_AGENTS : detectedAgents());
      const roots = [
        ...new Set([
          ...store.registeredProjects().map((p) => p.root),
          ...store.roots().map((r) => r.root),
        ]),
      ];
      const failed = setup(chosen, remove === true, roots).filter((r) => r.error);
      broadcast({ type: "projects" });
      if (failed.length)
        throw new BadRequest(failed.map((r) => `${r.file}: ${r.error}`).join("; "));
      return json(res, 200, setupStatus());
    }
    const sv = path.match(/^\/api\/projects\/([0-9a-f]{12})\/services(?:\/(m-[0-9a-f]{8}))?$/);
    if (sv) {
      const project = projectFor(sv[1]);
      if (!project) return json(res, 404, { error: "Unknown project" });
      const list = loadManual(store, project.id);
      const check = (run: () => typeof list) => {
        try {
          return run();
        } catch (error) {
          throw new BadRequest((error as Error).message);
        }
      };
      if (method === "POST" && !sv[2]) {
        const input = await payload();
        const next = check(() => addManual(list, validateManual(input)));
        saveManual(store, project.id, next);
        return json(res, 200, next);
      }
      const at = list.findIndex((x) => x.id === sv[2]);
      if (sv[2] && at < 0) return json(res, 404, { error: "Unknown service" });
      if (method === "PUT" && sv[2]) {
        const input = await payload();
        const next = check(() => {
          const entry = validateManual({ ...input, of: list[at].of }, list[at].id);
          return list.map((x, i) => (i === at ? entry : x));
        });
        saveManual(store, project.id, next);
        return json(res, 200, next);
      }
      if (method === "DELETE" && sv[2]) {
        const next = list.filter((_, i) => i !== at);
        saveManual(store, project.id, next);
        return json(res, 200, next);
      }
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
        saveManual(store, project.id, []);
        store.checkpoint();
        broadcast({ type: "projects" });
        return json(res, 200, removed);
      }
    }
    if (method === "PUT" && path === "/api/settings") {
      const before = store.settings();
      const next = mergeSettings(before, await payload());
      store.saveSettings(next);
      applyRetention(store);
      if (next.livePrices && !before.livePrices) void updateLivePrices();
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

  /** A browser approval in progress from Settings → Team sync → Connect. */
  let linking: { pair: string; url: string; error: string | null } | null = null;
  const syncState = () => ({ ...syncStatus(loadSync(store)), linking });

  /** One team-sync pass (summaries only); main.ts runs it every minute. */
  let syncing = false;
  async function sync(options?: Parameters<typeof syncOnce>[2]) {
    const c = loadSync(store);
    if (syncing || !c.enabled) return syncStatus(c);
    syncing = true;
    try {
      const next = await syncOnce(c, details(store.recentSessionIds(500)), options);
      // Settings may have changed while the upload ran; keep them and add only the outcome.
      const latest = loadSync(store);
      saveSync(store, {
        ...latest,
        lastSyncAt: next.lastSyncAt,
        lastError: next.lastError,
        sent: next.sent,
      });
      return syncStatus(loadSync(store));
    } finally {
      syncing = false;
    }
  }

  return { api, broadcast, sync };
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
