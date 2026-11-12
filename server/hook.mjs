#!/usr/bin/env node
// Claude Code and Codex run this for every hook event with the event JSON on stdin.
// Arguments: the Quoli port, then the agent when it is not Claude Code (for example "codex").
// It forwards the event to the local Quoli server and never affects the agent:
// it prints nothing (stdout is read as a hook decision) and always exits 0.
// The user-level install (`pnpm quoli-setup`) runs a copy named quoli-hook.mjs from the Quoli
// home; that copy queues events in spool.jsonl beside it while Quoli is not running, and the
// server reads the queue when it starts.
import { appendFileSync, statSync } from "node:fs";
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
    }
  } catch {}
}
process.exit(0);
