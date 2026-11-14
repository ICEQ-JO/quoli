import { type ReactNode, useCallback, useEffect, useState } from "react";
import { API_BASE } from "../host.ts";
import { FirstRun, PixelDissolve } from "./FirstRun.tsx";

const SEEN = "quoli.connected";
const seen = () => {
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    return false;
  }
};

/**
 * On the Quoli website, the app reads Quoli on this computer (see host.ts). Until that answers it
 * shows the first run (or, for someone it answered before, how to start it again), keeps looking
 * every few seconds, and dissolves into the app the moment Quoli answers.
 */
export function LocalGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");
  const [shownDown, setShownDown] = useState(false);
  const [dissolve, setDissolve] = useState(false);
  const [returning] = useState(seen);

  const check = useCallback(async () => {
    let ok = false;
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      ok = res.ok;
    } catch {}
    setState(ok ? "ok" : "down");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);
  useEffect(() => {
    if (state === "down") {
      setShownDown(true);
      const t = setTimeout(check, 3000);
      return () => clearTimeout(t);
    }
    if (state === "ok") {
      try {
        localStorage.setItem(SEEN, "1");
      } catch {}
      if (shownDown) setDissolve(true);
    }
  }, [state, check, shownDown]);

  if (state === "checking") return null;
  if (state === "down")
    return <FirstRun mode="offline" returning={returning} onRetry={() => void check()} />;
  return (
    <>
      {children}
      {dissolve && <PixelDissolve onDone={() => setDissolve(false)} />}
    </>
  );
}
