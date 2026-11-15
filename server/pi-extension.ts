// quoli-pi-extension — installed by `pnpm connect <repo> --agent pi` as <repo>/.pi/extensions/quoli.ts.
// Pi auto-discovers project extensions there (docs/extensions.md). It forwards what Pi reports
// (prompts, tool calls, assistant messages with token usage) to the local Quoli server. It never
// changes, blocks or delays the agent: handlers return at once, posts run in order in the
// background, and every failure is swallowed. It reads no credentials and no session files.
import { spawn } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";

const PORT = Number("__QUOLI_PORT__");
const URL = `http://127.0.0.1:${PORT}/ingest?agent=pi`;
const MAX_TEXT = 100_000;
// Set only by the user-level install: where events wait while Quoli is not running.
const SPOOL = "__QUOLI_SPOOL__";
// This computer's Quoli token (server/token.ts), filled in by the install.
const TOKEN_FILE = "__QUOLI_TOKEN_FILE__";
const SPOOL_MAX = 50 * 1024 * 1024;
// Redacted before the queue touches the disk; keep equal to SECRETS in server/ingest.ts
// (tests/local-files.test.ts checks).
const SECRETS = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
const redact = (t: string) => SECRETS.reduce((s, re) => s.replace(re, "[redacted]"), t);
// Events go out sealed (AES-256-GCM) with this computer's Quoli token (server/token.ts): only
// the real Quoli can read them, even if another program holds the port while Quoli is closed.
const seal = (text: string, token: string) => {
  const key = createHash("sha256").update(`quoli-seal:${token}`).digest();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  const b64 = (b: Buffer) => b.toString("base64");
  return JSON.stringify({ sealed: { iv: b64(iv), data: b64(data), tag: b64(tag) } });
};
const readToken = (file: string) => {
  try {
    const t = readFileSync(file, "utf8").trim();
    return /^[A-Za-z0-9_-]{32,}$/.test(t) ? t : null;
  } catch {
    return null;
  }
};

/** Queues an event for Quoli to read when it next starts; never throws. */
const spool = (body: string, at: string) => {
  try {
    if (!SPOOL || (existsSync(SPOOL) && statSync(SPOOL).size >= SPOOL_MAX)) return;
    appendFileSync(SPOOL, `${JSON.stringify({ agent: "pi", at, body: redact(body) })}\n`, {
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
    const run = JSON.parse(readFileSync(`${dir}sync.json`, "utf8")) as {
      command: string;
      args: string[];
      cwd: string;
    };
    writeFileSync(stamp, "");
    const opts = { cwd: run.cwd, detached: true, stdio: "ignore" as const, windowsHide: true };
    spawn(run.command, run.args, opts).unref();
  } catch {}
};

type Json = Record<string, unknown>;
type Ctx = { cwd?: string; sessionManager?: { getSessionId?: () => string | undefined } };
type Pi = { on: (event: string, handler: (event: Json, ctx: Ctx) => unknown) => void };

const clip = (v: unknown, depth = 0): unknown => {
  if (typeof v === "string") return v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}…` : v;
  if (Array.isArray(v)) return depth > 8 ? [] : v.map((x) => clip(x, depth + 1));
  if (v && typeof v === "object") {
    if (depth > 8) return {};
    const out: Json = {};
    for (const [k, x] of Object.entries(v))
      if (typeof x !== "function") out[k] = clip(x, depth + 1);
    return out;
  }
  return v;
};

let queue: Promise<unknown> = Promise.resolve();
function post(payload: Json) {
  const at = new Date().toISOString();
  let body: string;
  try {
    body = JSON.stringify(clip(payload));
  } catch {
    return;
  }
  queue = queue
    .then(() => {
      const token = readToken(TOKEN_FILE);
      if (!token) throw new Error("Quoli has not started yet");
      return fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: seal(body, token),
        signal: AbortSignal.timeout(1500),
      }).then((res) => {
        if (res.status === 401) throw new Error("refused");
      });
    })
    .catch(() => spool(body, at));
}

/** The text of a tool result: its text parts joined. */
const textOf = (result: unknown): string | null => {
  const content = (result as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return typeof result === "string" ? result : null;
  return content
    .map((c) => (c && typeof c === "object" && (c as Json).type === "text" ? (c as Json).text : ""))
    .join("");
};

export default function quoli(pi: Pi) {
  const send = (ctx: Ctx, fields: Json) => {
    try {
      const sessionID = ctx.sessionManager?.getSessionId?.();
      if (typeof sessionID !== "string" || typeof ctx.cwd !== "string") return;
      post({ ...fields, sessionID, cwd: ctx.cwd });
    } catch {}
  };
  pi.on("session_start", (e, ctx) => {
    send(ctx, { pi_event: "session.start", reason: e.reason });
  });
  pi.on("before_agent_start", (e, ctx) => {
    send(ctx, { pi_event: "prompt", text: typeof e.prompt === "string" ? e.prompt : "" });
  });
  pi.on("tool_execution_start", (e, ctx) => {
    send(ctx, { pi_event: "tool.start", id: e.toolCallId, tool: e.toolName, input: e.args });
  });
  pi.on("tool_execution_end", (e, ctx) => {
    send(ctx, {
      pi_event: "tool.end",
      id: e.toolCallId,
      tool: e.toolName,
      isError: e.isError === true,
      output: textOf(e.result),
    });
  });
  // The last assistant text per session, sent with agent_end as the agent's reply.
  const replies = new Map<string, string>();
  pi.on("message_end", (e, ctx) => {
    const m = e.message as Json | undefined;
    if (m?.role !== "assistant") return;
    const said = textOf(m);
    const id = ctx.sessionManager?.getSessionId?.();
    if (said?.trim() && typeof id === "string") replies.set(id, said);
    send(ctx, {
      pi_event: "message.end",
      messageID: `${m.timestamp ?? ""}`,
      model: m.model,
      provider: m.provider,
      usage: m.usage,
      stopReason: m.stopReason,
    });
  });
  pi.on("agent_end", (_e, ctx) => {
    const id = ctx.sessionManager?.getSessionId?.();
    const text = typeof id === "string" ? (replies.get(id) ?? null) : null;
    if (typeof id === "string") replies.delete(id);
    send(ctx, { pi_event: "agent.end", text });
  });
  pi.on("session_shutdown", (e, ctx) => {
    send(ctx, { pi_event: "session.shutdown", reason: e.reason });
  });
}
