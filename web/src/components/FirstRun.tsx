import { type ReactNode, useEffect, useRef, useState } from "react";
import { api, useData } from "../api.ts";
import { hosted, LOCAL, localPort, setLocalPort } from "../host.ts";
import { PixelScene } from "../landing/PixelScene.tsx";
import { Mark } from "../landing/ui.tsx";
import "../firstrun.css";

const START = "npx https://iceq.best/quoli.tgz";

type Status = "done" | "current" | "waiting";

/**
 * The first run, in the landing page's world (docs/landing-design.md): from "Quoli is not on this
 * computer yet" to the first recorded session. `offline` is the website before Quoli answers
 * (LocalGate); `setup` is the app with no session yet (App). Every step is read from real state,
 * so the page moves on by itself; App and LocalGate dissolve it into the dashboard when it is done.
 */
export function FirstRun({
  mode,
  returning = false,
  onRetry,
  onSkip,
}: {
  mode: "offline" | "setup";
  /** Quoli answered this browser before: it stopped, it is not new. */
  returning?: boolean;
  onRetry?: () => void;
  onSkip?: () => void;
}) {
  const offline = mode === "offline";
  const [setup, refreshSetup] = useData(offline ? null : "setup", api.setupStatus);
  const recording = Boolean(setup?.some((s) => s.installed));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computer: Status = offline ? "current" : "done";
  const record: Status = offline ? "waiting" : !setup ? "waiting" : recording ? "done" : "current";
  const session: Status = !offline && recording ? "current" : "waiting";

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      const after = await api.setup(undefined);
      if (!after.some((x) => x.installed))
        setError(
          "No coding agent found on this computer. Install Claude Code, Codex, OpenCode or Pi, run it once, then try again.",
        );
      refreshSetup();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const title = returning
    ? "Quoli isn't running on this computer."
    : "Let's record your first session.";
  const lede = returning
    ? "Start it again and this page picks it up within a few seconds. Nothing is lost: your agents' sessions are still recorded while it is stopped."
    : "Quoli records what your coding agents read, change, run and spend, and lays it out on one map. It runs on your own computer, and this page reads it from there: your prompts and code never leave it.";

  return (
    <div className="first-run">
      <header className="fr-top">
        <span className="fr-brand">
          <Mark small />
          Quoli
        </span>
        {onSkip && (
          <button type="button" className="fr-skip" onClick={onSkip}>
            Skip to the app
          </button>
        )}
      </header>

      <main className="fr-field" id="main" tabIndex={-1}>
        <section className="fr-copy" aria-labelledby="fr-title">
          <h1 id="fr-title">{title}</h1>
          <p className="fr-lede">{lede}</p>

          <ol className="fr-steps">
            <Step
              status={computer}
              title={computer === "done" ? "Quoli is running on this computer" : "Start Quoli"}
            >
              <p>
                Run this in a terminal, inside the project you work on. Quoli then runs in the
                background and starts by itself when you log in.
              </p>
              <Command text={START} />
              <p className="fr-note">
                <span className="fr-pulse" aria-hidden="true" />
                <span role="status">Waiting for Quoli on port {localPort}</span>
                {onRetry && (
                  <button type="button" className="fr-link" onClick={onRetry}>
                    Check now
                  </button>
                )}
              </p>
              <Trouble />
            </Step>
            {!returning && (
              <Step
                status={record}
                title={record === "done" ? "Recording is on" : "Turn on recording"}
              >
                <p>
                  Quoli adds a small hook to Claude Code, Codex, OpenCode and Pi, so every session
                  is recorded, even with Quoli closed.
                </p>
                <p>
                  <button type="button" className="fr-button" disabled={busy} onClick={turnOn}>
                    {busy ? "Turning it on…" : "Turn on recording"}
                  </button>
                </p>
                {error && (
                  <p className="fr-error" role="alert">
                    {error}
                  </p>
                )}
              </Step>
            )}
            {!returning && (
              <Step status={session} title="Start a session with your agent">
                <p>
                  Open your coding agent in a project Quoli records and ask it anything. The session
                  shows up here as it happens, and this page opens the dashboard.
                </p>
                <p className="fr-note">
                  <span className="fr-pulse" aria-hidden="true" />
                  <span role="status">Listening for your first session</span>
                </p>
              </Step>
            )}
          </ol>
        </section>

        <div className="fr-scene" aria-hidden={false}>
          <PixelScene kind="forest" />
          <ol className="fr-signal" aria-label="Progress">
            <li className={computer}>
              <span className="fr-dot" aria-hidden="true" />
              This computer
              <span className="sr-only">{label(computer)}</span>
            </li>
            <li className={record}>
              <span className="fr-dot" aria-hidden="true" />
              Recording
              <span className="sr-only">{label(record)}</span>
            </li>
            <li className={session}>
              <span className="fr-dot" aria-hidden="true" />
              First session
              <span className="sr-only">{label(session)}</span>
            </li>
          </ol>
        </div>
      </main>

      {!returning && <Lenses />}
    </div>
  );
}

const label = (s: Status) =>
  s === "done" ? ": done" : s === "current" ? ": in progress" : ": not yet";

function Step({ status, title, children }: { status: Status; title: string; children: ReactNode }) {
  return (
    <li className={`fr-step ${status}`} aria-current={status === "current" ? "step" : undefined}>
      <span className="fr-marker" aria-hidden="true">
        {status === "done" && (
          <svg viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">
            <path
              d="M2 6h2v2H2zM4 8h2v2H4zM6 6h2v2H6zM8 4h2v2H8zM10 2h2v2h-2z"
              fill="currentColor"
            />
          </svg>
        )}
      </span>
      <div className="fr-step-body">
        <h2>
          {title}
          {status === "done" && <span className="sr-only"> (done)</span>}
        </h2>
        {status === "current" && children}
      </div>
    </li>
  );
}

function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fr-command">
      <code>
        <span aria-hidden="true">$ </span>
        {text}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {}
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Trouble() {
  const [port, setPort] = useState(localPort);
  const valid = /^\d{2,5}$/.test(port);
  if (!hosted) return null;
  return (
    <details className="fr-trouble">
      <summary>Still not connecting?</summary>
      <ul>
        <li>
          When your browser asks whether this site may reach apps on your device or local network,
          choose <strong>Allow</strong>. That is how this page reads Quoli.
        </li>
        <li>
          <strong>Brave:</strong> turn Shields off for this site. <strong>Safari</strong> blocks it:
          use Chrome, Edge or Firefox, or Quoli's own page at <a href={LOCAL}>{LOCAL}</a>.
        </li>
        <li>
          <form
            className="fr-port"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              setLocalPort(port);
              location.reload();
            }}
          >
            <label htmlFor="fr-port">Started Quoli with --port? Its port:</label>
            <input
              id="fr-port"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.trim())}
              aria-invalid={!valid}
            />
            <button type="submit" disabled={!valid || port === localPort}>
              Use
            </button>
          </form>
        </li>
      </ul>
    </details>
  );
}

/** How to read Quoli once a session is in: the lenses, in the landing page's four-column row. */
function Lenses() {
  const lenses: { name: string; text: string; icon: string }[] = [
    {
      name: "Summary",
      text: "What you asked, what changed, what ran, and what it cost.",
      icon: "M4 2h8l4 4v12H4zM7 8h6v2H7zm0 4h6v2H7z",
    },
    {
      name: "Map",
      text: "The code the agent touched, and every function that calls it.",
      icon: "M2 2h6v6H2zm10 0h6v6h-6zM7 12h6v6H7zM4 8v3h6v1h2V9H6V8z",
    },
    {
      name: "Agents",
      text: "Every step it took, in order: what failed, and where it went in circles.",
      icon: "M4 5h12v10H4zM8 2h4v3H8zM7 8h2v3H7zm4 0h2v3h-2z",
    },
    {
      name: "Git and Infra",
      text: "The branch and commits it landed on, and the services that run it.",
      icon: "M4 2h4v4H7v5h6V6h-1V2h4v4h-1v7H9v3h1v3H6v-3h1V6H4z",
    },
  ];
  return (
    <section className="fr-lenses" aria-labelledby="fr-lenses-title">
      <h2 id="fr-lenses-title">Then open a session</h2>
      <ul>
        {lenses.map((l) => (
          <li key={l.name}>
            <svg viewBox="0 0 20 20" aria-hidden="true" shapeRendering="crispEdges">
              <path d={l.icon} fill="currentColor" fillRule="evenodd" />
            </svg>
            <div>
              <h3>{l.name}</h3>
              <p>{l.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The one authored moment: when the first run is over, the page dissolves into the app pixel by
 * pixel. A canvas over everything, cells drop out in a random order over ~0.9 s.
 */
export function PixelDissolve({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      done.current();
      return;
    }
    const cell = 28;
    const w = Math.ceil(innerWidth / cell);
    const h = Math.ceil(innerHeight / cell);
    canvas.width = w * cell;
    canvas.height = h * cell;
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    const shades = dark
      ? ["#101f30", "#1c354d", "#172d43", "#35526c"]
      : ["#edf7fc", "#dceef9", "#a9d8f2", "#cfe8f6"];
    // Each cell leaves at its own moment, a little earlier towards the top left.
    const cells = Array.from({ length: w * h }, (_, i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      return {
        x,
        y,
        at: Math.random() * 0.75 + ((x / w + y / h) / 2) * 0.25,
        shade: shades[Math.floor(Math.random() * shades.length)],
      };
    });
    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const t = (now - start) / 900;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const c of cells) {
        if (c.at < t) continue;
        ctx.fillStyle = c.shade;
        ctx.fillRect(c.x * cell, c.y * cell, cell, cell);
      }
      if (t < 1) frame = requestAnimationFrame(draw);
      else done.current();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a decorative overlay canvas, never focused
    <canvas ref={ref} className="pixel-dissolve" aria-hidden="true" />
  );
}

const SKIPPED = "quoli.firstRunSkipped";
const SKIP_EVENT = "quoli:first-run";

/** "Skip to the app" is remembered in this browser; the empty dashboard can bring it back. */
export function setFirstRunSkipped(skipped: boolean) {
  try {
    if (skipped) localStorage.setItem(SKIPPED, "1");
    else localStorage.removeItem(SKIPPED);
  } catch {}
  window.dispatchEvent(new Event(SKIP_EVENT));
}

const readSkipped = () => {
  try {
    return localStorage.getItem(SKIPPED) === "1";
  } catch {
    return false;
  }
};

export function useFirstRunSkipped(): boolean {
  const [skipped, setSkipped] = useState(readSkipped);
  useEffect(() => {
    const on = () => setSkipped(readSkipped());
    window.addEventListener(SKIP_EVENT, on);
    return () => window.removeEventListener(SKIP_EVENT, on);
  }, []);
  return skipped;
}
