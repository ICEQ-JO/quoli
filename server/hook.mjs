#!/usr/bin/env node
// Claude Code and Codex run this for every hook event with the event JSON on stdin.
// Arguments: the Quoli port, then the agent when it is not Claude Code (for example "codex").
// It forwards the event to the local Quoli server and never affects the agent:
// it prints nothing (stdout is read as a hook decision) and always exits 0.
// The user-level install (`quoli setup` / `connect`) runs a copy named quoli-hook.mjs from the
// Quoli home; that copy queues events in spool.jsonl beside it while Quoli is not running and
// starts a short `quoli sync` that records them (and sends Team sync) without Quoli open.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SPOOL_MAX = 50 * 1024 * 1024;
const port = process.argv[2] ?? process.env.QUOLI_PORT ?? "4400";
const kind = /^[a-z-]+$/.test(process.argv[3] ?? "") ? process.argv[3] : "";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const body = Buffer.concat(chunks);
const at = new Date().toISOString();
try {
  await fetch(`http://127.0.0.1:${port}/ingest${kind ? `?agent=${kind}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(1500),
  });
} catch {
  // Quoli is not running; the agent continues unaffected.
  try {
    const self = fileURLToPath(import.meta.url);
    if (basename(self) === "quoli-hook.mjs") {
      const spool = join(dirname(self), "spool.jsonl");
      let size = 0;
      try {
        size = statSync(spool).size;
      } catch {}
      if (size < SPOOL_MAX) {
        const line = { agent: kind || "claude-code", at, body: body.toString("utf8") };
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
