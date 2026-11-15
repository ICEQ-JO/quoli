// quoli-opencode-plugin — installed by `pnpm connect <repo> --agent opencode`.
// OpenCode 2 loads this from <repo>/.opencode/plugins/. It forwards what OpenCode reports
// (prompts, tool calls, model steps with tokens) to the local Quoli server. It never changes,
// blocks or delays the agent: hooks return at once, posts run in order in the background, and
// every failure is swallowed. It does not read credentials or OpenCode's database.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

const PORT = Number("__QUOLI_PORT__");
const URL = `http://127.0.0.1:${PORT}/ingest?agent=opencode`;
const MAX_TEXT = 100_000;
// Set only by the user-level install: where events wait while Quoli is not running.
const SPOOL = "__QUOLI_SPOOL__";
const SPOOL_MAX = 50 * 1024 * 1024;
// Redacted before the queue touches the disk; keep equal to SECRETS in server/ingest.ts
// (tests/redact.test.ts checks).
const SECRETS = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
const redact = (t) => SECRETS.reduce((s, re) => s.replace(re, "[redacted]"), t);

/** Queues an event for Quoli to read when it next starts; never throws. */
const spool = (body, at) => {
  try {
    if (!SPOOL || (existsSync(SPOOL) && statSync(SPOOL).size >= SPOOL_MAX)) return;
    appendFileSync(SPOOL, `${JSON.stringify({ agent: "opencode", at, body: redact(body) })}\n`, {
      mode: 0o600,
    });
    kick();
  } catch {}
};

// Starts `quoli sync` beside the queue (it records the queue, sends Team sync, then exits) unless
// one ran in the last 90 seconds. The command is in sync.json, written by the user-level install.
const kick = () => {
  try {
    const dir = SPOOL.replace(/spool\.jsonl$/, "");
    const stamp = `${dir}sync.last`;
    if (existsSync(stamp) && Date.now() - statSync(stamp).mtimeMs < 90_000) return;
    const run = JSON.parse(readFileSync(`${dir}sync.json`, "utf8"));
    writeFileSync(stamp, "");
    const opts = { cwd: run.cwd, detached: true, stdio: "ignore", windowsHide: true };
    spawn(run.command, run.args, opts).unref();
  } catch {}
};

const clip = (v, depth = 0) => {
  if (typeof v === "string") return v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}…` : v;
  if (Array.isArray(v)) return depth > 8 ? [] : v.map((x) => clip(x, depth + 1));
  if (v && typeof v === "object") {
    if (depth > 8) return {};
    const out = {};
    for (const [k, x] of Object.entries(v))
      if (typeof x !== "function") out[k] = clip(x, depth + 1);
    return out;
  }
  return v;
};

let queue = Promise.resolve();
function post(payload) {
  const at = new Date().toISOString();
  const body = JSON.stringify(clip(payload));
  queue = queue
    .then(() =>
      fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(1500),
      }),
    )
    .catch(() => spool(body, at));
}

export default {
  id: "quoli",
  setup: async (ctx) => {
    const cwd = ctx.location?.directory;
    const version = ctx.app?.version ?? null;
    if (typeof cwd !== "string") return () => {};
    const started = new Set();
    const models = new Map();
    const send = (sessionID, fields) => {
      if (typeof sessionID !== "string") return;
      if (!started.has(sessionID)) {
        started.add(sessionID);
        post({ opencode_event: "session.start", sessionID, cwd, version });
      }
      post({ ...fields, sessionID, cwd, version });
    };
    const safe = (fn) => async (x) => {
      try {
        fn(x);
      } catch {}
    };

    await ctx.session?.hook?.(
      "prompt",
      safe((x) => send(x.sessionID, { opencode_event: "prompt", text: x.prompt?.text ?? "" })),
    );
    await ctx.tool?.hook?.(
      "execute.before",
      safe((x) =>
        send(x.sessionID, {
          opencode_event: "tool.before",
          id: x.id,
          tool: x.tool,
          agent: x.agent,
          input: x.input,
        }),
      ),
    );
    await ctx.tool?.hook?.(
      "execute.after",
      safe((x) =>
        send(x.sessionID, {
          opencode_event: "tool.after",
          id: x.id,
          tool: x.tool,
          agent: x.agent,
          input: x.input,
          status: x.status,
          output: x.result?.output,
          content: x.result?.content,
          error: x.error?.message ?? null,
        }),
      ),
    );

    const controller = new AbortController();
    // The last finished text block per session, sent with the turn end as the agent's reply.
    const replies = new Map();
    const types = [
      "session.text.ended",
      "session.step.started",
      "session.step.ended",
      "session.execution.succeeded",
      "session.execution.failed",
    ];
    (async () => {
      try {
        for await (const e of ctx.event.subscribe({ signal: controller.signal, types })) {
          const d = e?.data ?? {};
          // OpenCode 2 runs one shared service: keep only this directory's sessions.
          if (e?.location?.directory && e.location.directory !== cwd) continue;
          if (!started.has(d.sessionID)) continue;
          if (e.type === "session.text.ended") {
            if (typeof d.text === "string" && d.text.trim()) replies.set(d.sessionID, d.text);
          } else if (e.type === "session.step.started") {
            models.set(d.assistantMessageID, d.model?.id ?? null);
          } else if (e.type === "session.step.ended") {
            send(d.sessionID, {
              opencode_event: "step.ended",
              messageID: d.assistantMessageID,
              model: models.get(d.assistantMessageID) ?? null,
              tokens: d.tokens,
              cost: d.cost,
            });
            models.delete(d.assistantMessageID);
          } else {
            send(d.sessionID, {
              opencode_event: "turn.ended",
              outcome: e.type.split(".").pop(),
              text: replies.get(d.sessionID) ?? null,
            });
            replies.delete(d.sessionID);
          }
        }
      } catch {}
    })();
    return () => controller.abort();
  },
};
