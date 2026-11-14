import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentKind,
  CodeGraph,
  CodeMap,
  CommitDetail,
  EventHit,
  GitState,
  InfraMap,
  InsightsReport,
  LivePriceStatus,
  ManualService,
  Overview,
  PriceTable,
  Project,
  ReviewDiff,
  ServerInfo,
  SessionDetail,
  SessionReview,
  SessionSummary,
  Settings,
  SetupStatus,
  SyncStatus,
  UsageReport,
} from "../../shared/model.ts";
import { API_BASE } from "./host.ts";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, init);
  if (!res.ok) {
    let message = `${res.status} ${path}`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

const get = <T>(path: string) => request<T>(path);
/** Mutations send JSON; the browser adds the Origin header itself. */
const send = <T>(method: string, path: string, body: unknown = {}) =>
  request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const q = (root: string) => `root=${encodeURIComponent(root)}`;
const id = encodeURIComponent;

export interface SettingsResponse {
  settings: Settings;
  info: ServerInfo;
}

export const api = {
  projects: () => get<Project[]>("/api/projects"),
  connectProject: (path: string, agents?: AgentKind[]) =>
    send<Project>("POST", "/api/projects", { path, agents }),
  setupStatus: () => get<SetupStatus[]>("/api/setup"),
  setup: (agents: AgentKind[] | undefined, remove = false) =>
    send<SetupStatus[]>("POST", "/api/setup", { agents, remove }),
  setRecording: (projectId: string, on: boolean) =>
    send<Project>("PUT", `/api/projects/${id(projectId)}/recording`, { on }),
  disconnectProject: (projectId: string) =>
    send<Project>("POST", `/api/projects/${id(projectId)}/disconnect`),
  deleteProject: (projectId: string) =>
    send<{ events: number; sessions: number }>("DELETE", `/api/projects/${id(projectId)}`),
  sessions: (projectId?: string) =>
    get<SessionSummary[]>(projectId ? `/api/sessions?project=${id(projectId)}` : "/api/sessions"),
  session: (sid: string) => get<SessionDetail>(`/api/session?id=${id(sid)}`),
  review: (sid: string) => get<SessionReview>(`/api/review?id=${id(sid)}`),
  reviewDiff: (sid: string, path: string) =>
    get<ReviewDiff>(`/api/review/diff?id=${id(sid)}&path=${id(path)}`),
  overview: () => get<Overview>("/api/overview"),
  settings: () => get<SettingsResponse>("/api/settings"),
  saveSettings: (patch: Partial<Settings>) => send<SettingsResponse>("PUT", "/api/settings", patch),
  prices: () => get<PriceTable>("/api/prices"),
  livePrices: () => get<LivePriceStatus>("/api/prices/live"),
  sync: () => get<SyncStatus>("/api/sync"),
  saveSync: (patch: { key?: string; enabled?: boolean }) =>
    send<SyncStatus>("PUT", "/api/sync", patch),
  connectSync: () => send<SyncStatus>("POST", "/api/sync/connect", {}),
  cancelConnect: () => send<SyncStatus>("DELETE", "/api/sync/connect", {}),
  usage: (days: number, agent?: AgentKind) =>
    get<UsageReport>(`/api/usage?days=${days}${agent ? `&agent=${agent}` : ""}`),
  insights: (days: number, f: { project?: string; agent?: string; model?: string }) => {
    const q = new URLSearchParams({ days: String(days) });
    for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
    return get<InsightsReport>(`/api/insights?${q}`);
  },
  savePrices: (table: PriceTable) => send<PriceTable>("PUT", "/api/prices", table),
  resetPrices: () => send<PriceTable>("DELETE", "/api/prices"),
  redactPreview: (text: string) => send<{ text: string }>("POST", "/api/redact-preview", { text }),
  code: (root: string) => get<CodeMap>(`/api/code?${q(root)}`),
  git: (root: string, limit?: number) =>
    get<GitState>(`/api/git?${q(root)}${limit ? `&limit=${limit}` : ""}`),
  infra: (root: string) => get<InfraMap>(`/api/infra?${q(root)}`),
  addService: (projectId: string, entry: Omit<ManualService, "id">) =>
    send<ManualService[]>("POST", `/api/projects/${id(projectId)}/services`, entry),
  updateService: (projectId: string, sid: string, entry: Omit<ManualService, "id" | "of">) =>
    send<ManualService[]>("PUT", `/api/projects/${id(projectId)}/services/${id(sid)}`, entry),
  removeService: (projectId: string, sid: string) =>
    send<ManualService[]>("DELETE", `/api/projects/${id(projectId)}/services/${id(sid)}`),
  commit: (root: string, sha: string) =>
    get<CommitDetail>(`/api/commit?${q(root)}&sha=${encodeURIComponent(sha)}`),
  /** 200 with the graph, or 202 `{status:"building"}` while the server parses. */
  codeGraph: (projectId: string) =>
    get<CodeGraph | { status: "building" }>(`/api/projects/${id(projectId)}/codegraph`),
  search: (projectId: string, query: string) =>
    get<EventHit[]>(`/api/search?project=${id(projectId)}&q=${encodeURIComponent(query)}`),
  file: (root: string, path: string) =>
    get<{ path: string; content: string | null; diff: string | null }>(
      `/api/file?${q(root)}&path=${encodeURIComponent(path)}`,
    ),
};

/**
 * Fetches whenever `key` changes and whenever `refresh()` is called. Keeps old data while
 * reloading; `error` holds the message of the latest failed load and clears on success.
 */
export function useData<T>(key: string | null, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  const lastKey = useRef(key);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the refresh trigger
  useEffect(() => {
    if (lastKey.current !== key) {
      setData(null);
      setError(null);
    }
    lastKey.current = key;
    if (key === null) return;
    let live = true;
    loader
      .current()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [key, tick]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return [data, refresh, error] as const;
}

export type LiveMessage = { type: "event"; sessionId: string } | { type: "projects" };
type Listener = (m: LiveMessage) => void;

const listeners = new Set<Listener>();
let polling = false;

/**
 * Asks the local server for changes about once a second (GET /api/changes) while any page
 * listens. Each request ends at once, so any number of tabs and reloads work; a held stream per
 * tab ran into the browser's six-connections-per-address limit.
 */
async function poll() {
  if (polling) return;
  polling = true;
  let after = -1;
  let failed = false;
  while (listeners.size) {
    try {
      const res = await fetch(`${API_BASE}/api/changes?after=${after}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const { seq, changes } = (await res.json()) as { seq: number; changes: LiveMessage[] };
      // Back after the server was down: anything fetched meanwhile failed, so reload it.
      const all = failed ? [{ type: "projects" } as LiveMessage, ...changes] : changes;
      failed = false;
      after = seq;
      // One notice per session (and one for projects) however many events arrived since.
      const seen = new Set<string>();
      for (const m of all) {
        const typed: LiveMessage =
          m.type === "projects" ? { type: "projects" } : { type: "event", sessionId: m.sessionId };
        const key = typed.type === "projects" ? "" : typed.sessionId;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const l of listeners) l(typed);
      }
    } catch {
      failed = after >= 0;
    }
    // A hidden tab only needs to catch up when shown again.
    await new Promise((r) => setTimeout(r, document.hidden ? 5000 : 1000));
  }
  polling = false;
}

/** Live changes from the local server, one poll loop shared by every subscriber in this tab. */
export function useLiveEvents(onMessage: Listener) {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  useEffect(() => {
    const l: Listener = (m) => handler.current(m);
    listeners.add(l);
    void poll();
    return () => {
      listeners.delete(l);
    };
  }, []);
}
