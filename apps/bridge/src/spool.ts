import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { NormalizedEvent } from "@traceframe/schema";
import { runtime } from "@traceframe/storage/runtime";

/**
 * Bounded retry spool for sanitized observations that could not be delivered.
 *
 * The spool lives in the private local data directory and never holds raw
 * source content: only events that already passed the privacy pipeline are
 * stored here.
 */

const MAX_EVENTS = 1000;
const MAX_BYTES = 10 * 1024 * 1024;

/** Observations waiting for delivery. */
export function spoolDepth(): number {
  return readSpool().length;
}

export function spoolPath(): string {
  return `${runtime().dataDir}/bridge-spool.jsonl`;
}

function readSpool(): NormalizedEvent[] {
  const path = spoolPath();
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const events: NormalizedEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as NormalizedEvent);
    } catch {
      // A damaged line is dropped rather than blocking the rest of the spool.
    }
  }
  return events;
}

function writeSpool(events: NormalizedEvent[]): void {
  const path = spoolPath();
  mkdirSync(runtime().dataDir, { recursive: true, mode: 0o700 });
  const body = events.map((event) => JSON.stringify(event)).join("\n");
  writeFileSync(path, body ? `${body}\n` : "", { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Stores one observation. The oldest entries are dropped when the cap is reached. */
export function spool(event: NormalizedEvent): void {
  const events = readSpool();
  events.push(event);
  let kept = events;
  while (kept.length > MAX_EVENTS) kept = kept.slice(kept.length - MAX_EVENTS);
  let body = kept.map((entry) => JSON.stringify(entry)).join("\n");
  if (Buffer.byteLength(body) > MAX_BYTES) {
    // Drop from the front until the file fits the bound.
    while (kept.length > 1 && Buffer.byteLength(body) > MAX_BYTES) {
      kept = kept.slice(1);
      body = kept.map((entry) => JSON.stringify(entry)).join("\n");
    }
  }
  writeSpool(kept);
}

/** Sends every spooled observation. Successfully delivered entries are removed. */
export async function drainSpool(
  send: (event: NormalizedEvent) => Promise<boolean>,
): Promise<{ sent: number; remaining: number; dropped: number }> {
  const events = readSpool();
  const remaining: NormalizedEvent[] = [];
  let sent = 0;
  for (const event of events) {
    if (await send(event)) sent++;
    else remaining.push(event);
  }
  writeSpool(remaining);
  return { sent, remaining: remaining.length, dropped: 0 };
}
