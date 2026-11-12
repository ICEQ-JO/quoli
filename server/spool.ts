import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { AGENT_KINDS, type AgentKind } from "../shared/model.ts";
import type { Store } from "./db.ts";
import { ingest } from "./ingest.ts";

/**
 * Reads the events hooks and plugins queued while Quoli was not running (one JSON line each:
 * `{ agent, at, body }`), records them in order with the time they happened, and empties the
 * queue. Called once at startup, before the server takes new events, so they keep their order.
 * Lines that cannot be read are skipped. Returns the number recorded.
 */
export function drainSpool(store: Store, file: string): number {
  if (!existsSync(file)) return 0;
  const taken = `${file}.${process.pid}`;
  try {
    renameSync(file, taken);
  } catch {
    return 0;
  }
  let recorded = 0;
  try {
    for (const line of readFileSync(taken, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const { agent, at, body } = JSON.parse(line) as {
          agent: unknown;
          at: unknown;
          body: unknown;
        };
        if (!AGENT_KINDS.includes(agent as AgentKind) || typeof body !== "string") continue;
        const when = typeof at === "string" && !Number.isNaN(Date.parse(at)) ? at : undefined;
        const payload = JSON.parse(body);
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
        if (ingest(store, payload, when, undefined, agent as AgentKind)) recorded++;
      } catch {}
    }
  } finally {
    rmSync(taken, { force: true });
  }
  return recorded;
}
