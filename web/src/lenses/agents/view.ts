import { useSyncExternalStore } from "react";

/** Steps (one row per call, details in place) or Lanes (the graph). Remembered per browser. */
export type AgentsView = "timeline" | "graph";

const KEY = "quoli.agents.view";
const listeners = new Set<() => void>();

function read(): AgentsView {
  try {
    return localStorage.getItem(KEY) === "graph" ? "graph" : "timeline";
  } catch {
    return "timeline";
  }
}

let current = read();

export function setAgentsView(v: AgentsView) {
  current = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {}
  for (const l of listeners) l();
}

export function useAgentsView(): AgentsView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
