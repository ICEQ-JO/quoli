import type { LiveSession } from "./model.ts";

/**
 * Local alerts (#130). Evaluated in the viewer's browser from the overview it already has, so
 * nothing leaves the machine. Every trigger is off until the viewer turns it on.
 */
export const ALERT_TRIGGERS = ["cost", "budget", "loop", "quiet", "ended"] as const;
export type AlertTrigger = (typeof ALERT_TRIGGERS)[number];

export interface AlertConfig {
  cost: { on: boolean; usd: number };
  budget: { on: boolean };
  loop: { on: boolean };
  quiet: { on: boolean; minutes: number };
  ended: { on: boolean };
  /** Also show a system notification (needs the browser's permission). */
  system: boolean;
}

export const DEFAULT_ALERTS: AlertConfig = {
  cost: { on: false, usd: 5 },
  budget: { on: false },
  loop: { on: false },
  // A session with no event for 10 minutes stops being live, so quiet must fire before that.
  quiet: { on: false, minutes: 5 },
  ended: { on: false },
  system: false,
};

export const QUIET_MAX_MINUTES = 9;

export interface Alert {
  /** De-duplication key: one alert per session per trigger (per day for the budget). */
  key: string;
  trigger: AlertTrigger;
  sessionId: string | null;
  projectId: string | null;
  title: string;
  body: string;
}

export interface AlertInput {
  now: number;
  /** Live sessions now, and at the previous evaluation (null on the first one). */
  live: LiveSession[];
  previous: LiveSession[] | null;
  /** Estimated spend today and the daily budget, when set. */
  spentToday: number | null;
  dailyBudget: number | null;
  /** Local YYYY-MM-DD, so the budget alert fires once a day. */
  today: string;
  /** Project id → name, for alert text. */
  projectName: (id: string) => string;
}

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const money = (n: number) => `$${n.toFixed(2)}`;

/** Read a stored config, keeping only known fields with sane values. */
export function parseAlertConfig(raw: unknown): AlertConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown>>;
  const on = (k: AlertTrigger) => r[k]?.on === true;
  const num = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : d;
  return {
    cost: { on: on("cost"), usd: num(r.cost?.usd, 0.01, 100_000, DEFAULT_ALERTS.cost.usd) },
    budget: { on: on("budget") },
    loop: { on: on("loop") },
    quiet: {
      on: on("quiet"),
      minutes: Math.round(
        num(r.quiet?.minutes, 1, QUIET_MAX_MINUTES, DEFAULT_ALERTS.quiet.minutes),
      ),
    },
    ended: { on: on("ended") },
    system: (raw as Record<string, unknown> | null)?.system === true,
  };
}

/**
 * The alerts due now that have not fired yet. Session text is limited to the title and the
 * project name: never prompts after the first, commands or tool output. Adds each returned key
 * to `fired`.
 */
export function evaluateAlerts(c: AlertConfig, input: AlertInput, fired: Set<string>): Alert[] {
  const out: Alert[] = [];
  const push = (a: Alert) => {
    if (fired.has(a.key)) return;
    fired.add(a.key);
    out.push(a);
  };
  const about = (s: LiveSession) => ({
    sessionId: s.id,
    projectId: s.projectId,
    body: `${clip(s.title)} · ${input.projectName(s.projectId)}`,
  });

  for (const s of input.live) {
    if (c.cost.on && s.cost.usd !== null && s.cost.usd >= c.cost.usd) {
      push({
        key: `${s.id}:cost`,
        trigger: "cost",
        title: `A session passed ${money(c.cost.usd)}`,
        ...about(s),
      });
    }
    if (c.loop.on && s.loops > 0) {
      push({ key: `${s.id}:loop`, trigger: "loop", title: "Possible loop", ...about(s) });
    }
    const quietFor = input.now - Date.parse(s.lastAt);
    if (c.quiet.on && quietFor >= c.quiet.minutes * 60_000) {
      push({
        key: `${s.id}:quiet`,
        trigger: "quiet",
        title: `Quiet for ${Math.floor(quietFor / 60_000)} minutes`,
        ...about(s),
      });
    }
  }
  if (c.ended.on && input.previous) {
    const still = new Set(input.live.map((s) => s.id));
    for (const s of input.previous) {
      if (still.has(s.id)) continue;
      push({ key: `${s.id}:ended`, trigger: "ended", title: "Session ended", ...about(s) });
    }
  }
  if (
    c.budget.on &&
    input.dailyBudget !== null &&
    input.spentToday !== null &&
    input.spentToday >= input.dailyBudget
  ) {
    push({
      key: `budget:${input.today}`,
      trigger: "budget",
      sessionId: null,
      projectId: null,
      title: "Daily budget reached",
      body: `${money(input.spentToday)} of ${money(input.dailyBudget)} estimated today`,
    });
  }
  return out;
}
