import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CodeMap,
  GitState,
  InfraMap,
  Project,
  SessionDetail,
  SessionSummary,
} from "../../shared/model.ts";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

const q = (root: string) => `root=${encodeURIComponent(root)}`;

export const api = {
  projects: () => get<Project[]>("/api/projects"),
  sessions: (root: string) => get<SessionSummary[]>(`/api/sessions?${q(root)}`),
  session: (id: string) => get<SessionDetail>(`/api/session?id=${encodeURIComponent(id)}`),
  code: (root: string) => get<CodeMap>(`/api/code?${q(root)}`),
  git: (root: string) => get<GitState>(`/api/git?${q(root)}`),
  infra: (root: string) => get<InfraMap>(`/api/infra?${q(root)}`),
  file: (root: string, path: string) =>
    get<{ path: string; content: string | null; diff: string | null }>(
      `/api/file?${q(root)}&path=${encodeURIComponent(path)}`,
    ),
};

/** Fetches whenever `key` changes and whenever `refresh()` is called. Keeps old data while reloading. */
export function useData<T>(key: string | null, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [tick, setTick] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  const lastKey = useRef(key);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the refresh trigger
  useEffect(() => {
    if (lastKey.current !== key) setData(null);
    lastKey.current = key;
    if (key === null) return;
    let live = true;
    loader
      .current()
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [key, tick]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return [data, refresh] as const;
}

/** Server-sent events from the local server; calls back with the session id that changed. */
export function useLiveEvents(onEvent: (sessionId: string) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    const source = new EventSource("/api/stream");
    source.onmessage = (m) => {
      try {
        handler.current(JSON.parse(m.data).sessionId);
      } catch {}
    };
    return () => source.close();
  }, []);
}
