import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentKind,
  CodeMap,
  CommitDetail,
  GitState,
  InfraMap,
  InsightsReport,
  LivePriceStatus,
  ManualService,
  Overview,
  PriceTable,
  Project,
  ServerInfo,
  SessionDetail,
  SessionSummary,
  Settings,
  SetupStatus,
  UsageReport,
} from "../../shared/model.ts";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
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
  disconnectProject: (projectId: string) =>
    send<Project>("POST", `/api/projects/${id(projectId)}/disconnect`),
  deleteProject: (projectId: string) =>
    send<{ events: number; sessions: number }>("DELETE", `/api/projects/${id(projectId)}`),
  sessions: (projectId?: string) =>
    get<SessionSummary[]>(projectId ? `/api/sessions?project=${id(projectId)}` : "/api/sessions"),
  session: (sid: string) => get<SessionDetail>(`/api/session?id=${id(sid)}`),
  overview: () => get<Overview>("/api/overview"),
  settings: () => get<SettingsResponse>("/api/settings"),
  saveSettings: (patch: Partial<Settings>) => send<SettingsResponse>("PUT", "/api/settings", patch),
  prices: () => get<PriceTable>("/api/prices"),
  livePrices: () => get<LivePriceStatus>("/api/prices/live"),
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
let source: EventSource | null = null;

function connect() {
  if (source) return;
  source = new EventSource("/api/stream");
  // After the server restarts the browser reconnects on its own; reload what we show, since
  // anything fetched while it was down failed.
  let opened = false;
  source.onopen = () => {
    if (opened) for (const l of listeners) l({ type: "projects" });
    opened = true;
  };
  source.onmessage = (m) => {
    try {
      const msg = JSON.parse(m.data);
      const typed: LiveMessage =
        msg.type === "projects"
          ? { type: "projects" }
          : { type: "event", sessionId: msg.sessionId };
      for (const l of listeners) l(typed);
    } catch {}
  };
}

/** Server-sent events from the local server, one connection shared by every subscriber. */
export function useLiveEvents(onMessage: Listener) {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  useEffect(() => {
    const l: Listener = (m) => handler.current(m);
    listeners.add(l);
    connect();
    return () => {
      listeners.delete(l);
      if (!listeners.size) {
        source?.close();
        source = null;
      }
    };
  }, []);
}
