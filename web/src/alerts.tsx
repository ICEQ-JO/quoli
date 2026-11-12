import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  type Alert,
  type AlertConfig,
  DEFAULT_ALERTS,
  evaluateAlerts,
  parseAlertConfig,
} from "../../shared/alerts.ts";
import type { LiveSession, Overview, Project } from "../../shared/model.ts";
import { Link, navigate, paths } from "./router.ts";

/* Alerts are this viewer's choice, so they live in this browser's storage, not in Settings on
   the server. Reading or writing storage can fail (private windows, blocked storage); alerts
   then simply stay off or forget what fired. */

const CONFIG = "quoli.alerts";
const FIRED = "quoli.alerts.fired";
const CHANGE = "quoli:alerts";

let cached: { raw: string | null; config: AlertConfig } | null = null;
function read(): AlertConfig {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CONFIG);
  } catch {}
  if (cached?.raw !== raw) {
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {}
    cached = { raw, config: raw ? parseAlertConfig(parsed) : DEFAULT_ALERTS };
  }
  return cached.config;
}

export function saveAlertConfig(c: AlertConfig) {
  try {
    localStorage.setItem(CONFIG, JSON.stringify(c));
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", cb);
  };
};

export const useAlertConfig = () => useSyncExternalStore(subscribe, read, () => DEFAULT_ALERTS);

function loadFired(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(FIRED) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((k) => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

function saveFired(fired: Set<string>) {
  try {
    localStorage.setItem(FIRED, JSON.stringify([...fired].slice(-500)));
  } catch {}
}

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const where = (a: Alert) =>
  a.projectId && a.sessionId ? paths.board(a.projectId, a.sessionId) : paths.usage();

/**
 * Watches the overview the shell already keeps fresh (SSE plus a 30-second poll, and a refresh
 * when the tab becomes visible again) and raises each due alert once, as a toast and, when
 * allowed, a system notification.
 */
export function useAlerts(
  overview: Overview | null,
  projects: Project[] | null,
  dailyBudget: number | null,
) {
  const config = useAlertConfig();
  const [toasts, setToasts] = useState<Alert[]>([]);
  const previous = useRef<LiveSession[] | null>(null);
  const fired = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!overview) return;
    const before = previous.current;
    previous.current = overview.live;
    const anyOn =
      config.cost.on || config.budget.on || config.loop.on || config.quiet.on || config.ended.on;
    if (!anyOn) return;
    fired.current ??= loadFired();
    const due = evaluateAlerts(
      config,
      {
        now: Date.now(),
        live: overview.live,
        previous: before,
        spentToday: overview.cost.today.usd,
        dailyBudget,
        today: localDay(new Date()),
        projectName: (id) => projects?.find((p) => p.id === id)?.name ?? "a project",
      },
      fired.current,
    );
    if (!due.length) return;
    saveFired(fired.current);
    setToasts((t) => [...t, ...due].slice(-4));
    if (
      config.system &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      for (const a of due) {
        try {
          const n = new Notification(a.title, { body: a.body, tag: a.key });
          n.onclick = () => {
            window.focus();
            navigate(where(a));
            n.close();
          };
        } catch {}
      }
    }
  }, [overview, projects, dailyBudget, config]);

  const dismiss = (key: string) => setToasts((t) => t.filter((a) => a.key !== key));
  return { toasts, dismiss };
}

/** In-app alerts, newest last. Each one closes itself after a while. */
export function Toasts({ toasts, dismiss }: { toasts: Alert[]; dismiss: (key: string) => void }) {
  return (
    <section className="toasts" aria-label="Alerts" aria-live="polite">
      {toasts.map((a) => (
        <Toast key={a.key} alert={a} dismiss={() => dismiss(a.key)} />
      ))}
    </section>
  );
}

function Toast({ alert, dismiss }: { alert: Alert; dismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const close = useRef(dismiss);
  close.current = dismiss;
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => close.current(), 12_000);
    return () => clearTimeout(t);
  }, [paused]);
  return (
    <div
      className={`toast ${alert.trigger}`}
      role="status"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="toast-text">
        <b>{alert.title}</b>
        <Link to={where(alert)} onClick={dismiss}>
          {alert.body}
        </Link>
      </div>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
