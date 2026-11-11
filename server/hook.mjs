#!/usr/bin/env node
// Claude Code runs this for every hook event with the event JSON on stdin.
// It forwards the event to the local Quoli server and never affects the agent:
// it prints nothing (stdout is read as a hook decision) and always exits 0.
const port = process.argv[2] ?? process.env.QUOLI_PORT ?? "4400";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
try {
  await fetch(`http://127.0.0.1:${port}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: Buffer.concat(chunks),
    signal: AbortSignal.timeout(1500),
  });
} catch {
  // Quoli is not running; the agent continues unaffected.
}
process.exit(0);
