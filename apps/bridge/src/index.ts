import type { NormalizedEvent } from "@traceframe/schema";
import { eventSchema } from "@traceframe/schema";
import { credential, runtime } from "@traceframe/storage/runtime";
import { hookStatus, installHooks, uninstallHooks } from "./install";
import { type HookPayload, normalizeHook } from "./normalize";
import { drainSpool, spool, spoolDepth } from "./spool";

/**
 * The passive hook bridge.
 *
 * Claude Code calls it with the hook JSON on stdin. It normalizes the payload,
 * delivers it to the local collector and never influences the agent: it always
 * exits 0 and never writes to stdout, because stdout is read as a hook decision.
 */

async function deliver(event: NormalizedEvent): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${runtime().collectorPort}/v1/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events: [event] }),
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export async function runHook(projectId: string): Promise<number> {
  const raw = await readStdin();
  let payload: HookPayload;
  try {
    payload = JSON.parse(raw) as HookPayload;
  } catch {
    return 0;
  }
  const sessionId = typeof payload.session_id === "string" ? payload.session_id : null;
  if (!sessionId) return 0;
  const event = normalizeHook(payload, { projectId, sessionId });
  if (!event) return 0;
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success) return 0;
  if (await deliver(parsed.data)) return 0;
  spool(parsed.data);
  return 0;
}

export async function runDrain(): Promise<void> {
  const result = await drainSpool(deliver);
  console.log(`Bridge spool: ${result.sent} delivered, ${result.remaining} kept for later.`);
}

const COMMANDS = ["drain", "install", "uninstall", "status"];

async function main() {
  const [first, ...args] = process.argv.slice(2);
  const command = COMMANDS.includes(first) ? first : "";
  if (command === "drain") {
    await runDrain();
    return;
  }
  if (command === "install" || command === "uninstall" || command === "status") {
    const root = args[0] ?? process.cwd();
    if (command === "install") {
      const projectId = args[1] ?? process.env.TRACEFRAME_PROJECT_ID ?? "";
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(projectId)) {
        console.error("A registered project id is required.");
        process.exitCode = 1;
        return;
      }
      const result = installHooks(root, projectId);
      console.log(`Traceframe hooks installed in ${result.path}.`);
      console.log(
        `Events: ${result.added.join(", ")}. ${result.preservedGroups} existing hook groups were left untouched.`,
      );
      return;
    }
    if (command === "uninstall") {
      const result = uninstallHooks(root);
      console.log(
        `Traceframe hooks removed from ${root}. ${result.preservedGroups} existing hook groups were left untouched.`,
      );
      return;
    }
    const status = hookStatus(root);
    console.log(
      status.installed
        ? `Traceframe hooks are installed for project ${status.projectId}.`
        : "Traceframe hooks are not installed in this project.",
    );
    console.log(`Bridge spool: ${spoolDepth()} observations waiting for delivery.`);
    return;
  }
  const projectId = (command ? args[0] : first) ?? process.env.TRACEFRAME_PROJECT_ID ?? "";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(projectId)) {
    console.error("A registered project id is required.");
    process.exitCode = 1;
    return;
  }
  await runHook(projectId);
}

if (process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("quoli-hook-v1.mjs")) {
  main().catch(() => {
    // The bridge never fails the agent: no output, no non-zero exit.
    process.exitCode = 0;
  });
}
