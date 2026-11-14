import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
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

/** Chrome's permission for public pages to reach this computer (names differ by version). */
async function localAccessDenied(): Promise<boolean> {
  for (const name of ["loopback-network", "local-network-access", "local-network"]) {
    try {
      const status = await navigator.permissions.query({ name } as unknown as PermissionDescriptor);
      if (status.state === "denied") return true;
    } catch {}
  }
  return false;
}

/**
 * On the Quoli website, the app reads Quoli on this computer (see host.ts). Until that answers it
 * shows the first run (or, for someone it answered before, how to start it again), keeps looking
 * every few seconds, and dissolves into the app the moment Quoli answers.
 *
 * A check is never cut short: in Chrome, the first request to this computer waits while the
 * browser asks the person for permission, and cancelling it would take the prompt away. A check
 * that runs long is that prompt, so the page says so.
 */
export function LocalGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");
  const [shownDown, setShownDown] = useState(false);
  const [dissolve, setDissolve] = useState(false);
  const [asking, setAsking] = useState(false);
  const [manual, setManual] = useState(false);
  const [returning] = useState(seen);
  const inFlight = useRef(false);

  const check = useCallback(async (byHand = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (byHand) setManual(true);
    const slow = setTimeout(() => setAsking(true), 2500);
    let ok = false;
    try {
      const res = await fetch(`${API_BASE}/api/settings`, { cache: "no-store" });
      ok = res.ok;
    } catch {}
    clearTimeout(slow);
    const denied = !ok && (await localAccessDenied());
    inFlight.current = false;
    setAsking(denied);
    setManual(false);
    setState(ok ? "ok" : "down");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);
  useEffect(() => {
    if (state === "down") {
      setShownDown(true);
      const t = setInterval(() => void check(), 3000);
      return () => clearInterval(t);
    }
    if (state === "ok") {
      try {
        localStorage.setItem(SEEN, "1");
      } catch {}
      if (shownDown) setDissolve(true);
    }
  }, [state, check, shownDown]);

  if (state === "checking" && !asking) return null;
  if (state !== "ok")
    return (
      <FirstRun
        mode="offline"
        returning={returning}
        asking={asking}
        checking={manual}
        onRetry={() => void check(true)}
      />
    );
  return (
    <>
      {children}
      {dissolve && <PixelDissolve onDone={() => setDissolve(false)} />}
    </>
  );
}
