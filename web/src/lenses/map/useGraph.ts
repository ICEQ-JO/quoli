import { useCallback, useEffect, useState } from "react";
import type { CodeGraph } from "../../../../shared/model.ts";
import { api } from "../../api.ts";
import type { GraphState } from "../../state.ts";

const POLL_MS = 1500;

/**
 * Loads the project's code graph once `enabled`, polling every 1.5 s while the server answers 202
 * (still parsing), and again whenever `refresh` runs.
 */
export function useCodeGraph(projectId: string, enabled: boolean): GraphState {
  const [graph, setGraph] = useState<CodeGraph | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [loadedFor, setLoadedFor] = useState(projectId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the retry trigger
  useEffect(() => {
    if (!enabled) return;
    if (loadedFor !== projectId) {
      setLoadedFor(projectId);
      setGraph(null);
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      api
        .codeGraph(projectId)
        .then((r) => {
          if (!live) return;
          setError(null);
          if ("status" in r) {
            setBuilding(true);
            timer = setTimeout(load, POLL_MS);
          } else {
            setBuilding(false);
            setGraph(r);
          }
        })
        .catch((e) => {
          if (!live) return;
          setBuilding(false);
          setError(e instanceof Error ? e.message : String(e));
        });
    };
    load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [projectId, enabled, tick, loadedFor]);
  const retry = useCallback(() => setTick((t) => t + 1), []);
  return { graph: loadedFor === projectId ? graph : null, building, error, retry };
}
