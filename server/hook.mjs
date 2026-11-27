#!/usr/bin/env node
// Claude Code and Codex run this for every hook event with the event JSON on stdin.
// Arguments: the Quoli port, then the agent when it is not Claude Code (for example "codex").
// It forwards the event to the local Quoli server and never affects the agent:
// it prints nothing (stdout is read as a hook decision) and always exits 0.
// The user-level install (`quoli setup` / `connect`) runs a copy named quoli-hook.mjs from the
// Quoli home; that copy queues events in spool.jsonl beside it while Quoli is not running and
// starts a short `quoli sync` that records them (and sends Team sync) without Quoli open.
import { spawn } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SPOOL_MAX = 50 * 1024 * 1024;
// Redacted before the queue touches the disk; keep equal to SECRETS in server/redact.ts
// (tests/local-files.test.ts checks).
const SECRETS = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
const redact = (t) => SECRETS.reduce((s, re) => s.replace(re, "[redacted]"), t);
// Events go out sealed (AES-256-GCM) with this computer's Quoli token (server/token.ts): only
// the real Quoli can read them, even if another program holds the port while Quoli is closed.
const seal = (text, token) => {
  const key = createHash("sha256").update(`quoli-seal:${token}`).digest();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  const b64 = (b) => b.toString("base64");
  return JSON.stringify({ sealed: { iv: b64(iv), data: b64(data), tag: b64(tag) } });
};
const readToken = (file) => {
  try {
    const t = readFileSync(file, "utf8").trim();
    return /^[A-Za-z0-9_-]{32,}$/.test(t) ? t : null;
  } catch {
    return null;
  }
};
const port = process.argv[2] ?? process.env.QUOLI_PORT ?? "4400";
const kind = /^[a-z-]+$/.test(process.argv[3] ?? "") ? process.argv[3] : "";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const body = Buffer.concat(chunks);
const at = new Date().toISOString();
// scope.json beside the user-level copy says which repositories to record (server/scope.ts);
// events from any other folder are dropped here, before they are sent or queued.
if (!wanted()) process.exit(0);
// The user-level copy lives in the Quoli home; a project's hook finds it the way Quoli does.
const self = fileURLToPath(import.meta.url);
const quoliHome =
  basename(self) === "quoli-hook.mjs"
    ? dirname(self)
    : (process.env.QUOLI_HOME ?? join(homedir(), ".quoli"));
try {
  const token = readToken(join(quoliHome, "token"));
  if (!token) throw new Error("Quoli has not started yet");
  const res = await fetch(`http://127.0.0.1:${port}/ingest${kind ? `?agent=${kind}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: seal(body.toString("utf8"), token),
    signal: AbortSignal.timeout(1500),
  });
  if (res.status === 401) throw new Error("refused");
} catch {
  // Quoli is not running (or refused the event); the agent continues unaffected.
  try {
    if (basename(self) === "quoli-hook.mjs") {
      const spool = join(dirname(self), "spool.jsonl");
      let size = 0;
      try {
        size = statSync(spool).size;
      } catch {}
      if (size < SPOOL_MAX) {
        const line = { agent: kind || "claude-code", at, body: redact(body.toString("utf8")) };
        appendFileSync(spool, `${JSON.stringify(line)}\n`, { mode: 0o600 });
      }
      kick(dirname(self));
    }
  } catch {}
}
process.exit(0);

// Starts `quoli sync` beside the queue (it records the queue, sends Team sync, then exits) unless
// one ran in the last 90 seconds. The command is in sync.json, written by the user-level install.
function kick(dir) {
  try {
    const stamp = join(dir, "sync.last");
    if (existsSync(stamp) && Date.now() - statSync(stamp).mtimeMs < 90_000) return;
    const run = JSON.parse(readFileSync(join(dir, "sync.json"), "utf8"));
    writeFileSync(stamp, "");
    const opts = { cwd: run.cwd, detached: true, stdio: "ignore", windowsHide: true };
    spawn(run.command, run.args, opts).unref();
  } catch {}
}

function wanted() {
  try {
    const self = fileURLToPath(import.meta.url);
    if (basename(self) !== "quoli-hook.mjs") return true;
    const file = join(dirname(self), "scope.json");
    if (!existsSync(file)) return true;
    const scope = JSON.parse(readFileSync(file, "utf8"));
    const cwd = JSON.parse(body.toString("utf8"))?.cwd;
    if (typeof cwd !== "string") return true;
    // The same folder can be spelled differently: symlinks (macOS /var → /private/var) and, on
    // Windows and macOS, letter case. Same rule as `records` in server/scope.ts.
    const fold = (p) => (process.platform === "linux" ? p : p.toLowerCase());
    const real = (p) => {
      try {
        return realpathSync.native(p);
      } catch {
        return p;
      }
    };
    const within = (p, r) => p === r || p.startsWith(r.endsWith(sep) ? r : r + sep);
    const under = (r) => within(fold(cwd), fold(r)) || within(fold(real(cwd)), fold(real(r)));
    if (Array.isArray(scope.only)) return scope.only.some(under);
    return !(Array.isArray(scope.ignore) && scope.ignore.some(under));
  } catch {
    return true;
  }
}
