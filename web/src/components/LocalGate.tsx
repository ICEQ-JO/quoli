import { type ReactNode, useCallback, useEffect, useState } from "react";
import { API_BASE, LOCAL, localPort, setLocalPort } from "../host.ts";

const START = "npx https://iceq.best/quoli.tgz";

/**
 * On the Quoli website, the app reads Quoli on this computer (see host.ts). Until that answers,
 * this explains why and what to do, and keeps looking so the app appears as soon as Quoli starts.
 */
export function LocalGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");
  const [tries, setTries] = useState(0);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      setState(res.ok ? "ok" : "down");
    } catch {
      setState("down");
    }
    setTries((t) => t + 1);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);
  useEffect(() => {
    if (state !== "down") return;
    const t = setTimeout(check, 3000);
    return () => clearTimeout(t);
  }, [state, check]);

  if (state === "ok") return <>{children}</>;
  if (state === "checking" && tries === 0) {
    return (
      <main className="local-gate" aria-busy="true">
        <p className="faint">Looking for Quoli on this computer…</p>
      </main>
    );
  }
  return (
    <main className="local-gate">
      <div className="local-gate-card">
        <h1>Open Quoli on this computer</h1>
        <p>
          This page shows your sessions straight from Quoli on your computer. Nothing is uploaded:
          your prompts and code stay where they are.
        </p>
        <ol className="steps">
          <li className="current" aria-current="step">
            <span className="step-mark" aria-hidden="true">
              1
            </span>
            <div className="step-body">
              <h2>Start Quoli</h2>
              <p>
                Run this in a terminal, inside the project you work on. Quoli then runs in the
                background and starts by itself when you log in.
              </p>
              <Command text={START} />
              <p className="faint">
                Already ran it before? Run it again: older versions can't talk to this page.
              </p>
            </div>
          </li>
          <li>
            <span className="step-mark" aria-hidden="true">
              2
            </span>
            <div className="step-body">
              <h2>Allow access when your browser asks</h2>
              <p>
                Your browser may ask whether iceq.best can reach apps on your device or local
                network. Allow it: that is how this page reads Quoli on your computer.
              </p>
            </div>
          </li>
        </ol>
        <p className="local-gate-wait" role="status">
          <span className="live-dot on" aria-hidden="true" /> Waiting for Quoli on port {localPort}…{" "}
          <button type="button" className="btn sm" onClick={() => void check()}>
            Try now
          </button>
        </p>
        <details className="local-gate-more">
          <summary>Still not connecting?</summary>
          <ul>
            <li>
              <strong>Brave:</strong> turn Shields off for this site.
            </li>
            <li>
              <strong>Safari</strong> blocks this page from reaching your computer. Use Chrome, Edge
              or Firefox, or open Quoli's own page at <a href={LOCAL}>{LOCAL}</a>.
            </li>
            <li>
              <PortField />
            </li>
          </ul>
        </details>
      </div>
    </main>
  );
}

function Command({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="cmd-line">
      <code>{text}</code>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } catch {}
        }}
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function PortField() {
  const [port, setPort] = useState(localPort);
  const valid = /^\d{2,5}$/.test(port);
  return (
    <form
      className="local-gate-port"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        setLocalPort(port);
        location.reload();
      }}
    >
      <label htmlFor="local-port">Started Quoli with --port? Its port:</label>
      <input
        id="local-port"
        className="input narrow"
        inputMode="numeric"
        value={port}
        onChange={(e) => setPort(e.target.value.trim())}
        aria-invalid={!valid}
      />
      <button type="submit" className="btn" disabled={!valid || port === localPort}>
        Use
      </button>
    </form>
  );
}
