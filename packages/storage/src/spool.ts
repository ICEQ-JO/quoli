import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { CapturePolicy, NormalizedEvent } from "@traceframe/schema";
import { sanitizeEvent, withholdContent } from "@traceframe/schema/privacy";
import { retryCaptureState } from "./policy";
import { runtime } from "./runtime";

/**
 * Bounded retry spool for sanitized observations that could not be delivered.
 *
 * The spool lives in the private local data directory and never holds raw
 * source content: only events that already passed the privacy pipeline are
 * stored here. Each entry records the lifecycle generation it was captured
 * under, so a purge or re-registration fences it instead of resurrecting
 * evidence. The collector owns lifecycle cleanup; the hook only appends.
 */

const MAX_EVENTS = 1000;
const MAX_BYTES = 10 * 1024 * 1024;
const LOCK_WAIT_MS = 100;
const LOCK_STALE_MS = 5000;

type Entry = {
  /** Receipt time of the retry write; null for an entry written before fencing. */
  spooledAt: string | null;
  /** Project lifecycle generation; null for an entry written before fencing. */
  epoch: number | null;
  event: NormalizedEvent;
};

export function spoolPath(): string {
  return `${runtime().dataDir}/bridge-spool.jsonl`;
}

function drainingPath(): string {
  return `${spoolPath()}.draining`;
}

function lockPath(): string {
  return `${spoolPath()}.lock`;
}

/**
 * Serializes every spool read-modify-write across hook, drain and collector
 * processes. A hook returns its fallback instead of waiting longer, so a stuck
 * lock never blocks the agent.
 */
function withSpoolLock<T>(fallback: T, run: () => T): T {
  mkdirSync(runtime().dataDir, { recursive: true, mode: 0o700 });
  const path = lockPath();
  const deadline = Date.now() + LOCK_WAIT_MS;
  let fd: number | null = null;
  while (fd === null) {
    try {
      fd = openSync(path, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        // A crashed writer leaves the lock behind; the critical sections are
        // short, so an old file cannot still be owned by a live writer.
        if (Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS) {
          unlinkSync(path);
          continue;
        }
      } catch {}
      if (Date.now() >= deadline) return fallback;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  try {
    return run();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(path);
    } catch {}
  }
}

/** Observations waiting for delivery, including an interrupted drain. */
export function spoolDepth(): number {
  return readEntries(spoolPath()).length + readEntries(drainingPath()).length;
}

function parseEntry(line: string): Entry | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    // Entries written before generation fencing carry the bare event.
    if (parsed.schemaVersion === 1)
      return { spooledAt: null, epoch: null, event: parsed as unknown as NormalizedEvent };
    if (typeof parsed.event !== "object" || parsed.event === null) return null;
    return {
      spooledAt: typeof parsed.spooledAt === "string" ? parsed.spooledAt : null,
      epoch: typeof parsed.epoch === "number" ? parsed.epoch : null,
      event: parsed.event as NormalizedEvent,
    };
  } catch {
    // A damaged line is dropped rather than blocking the rest of the spool.
    return null;
  }
}

function readEntries(path: string): Entry[] {
  if (!existsSync(path)) return [];
  const entries: Entry[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = parseEntry(line);
    if (entry) entries.push(entry);
  }
  return entries;
}

function writeEntries(path: string, entries: Entry[]): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
  const temp = `${path}.tmp`;
  writeFileSync(temp, body ? `${body}\n` : "", { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
}

function trim(entries: Entry[]): Entry[] {
  let kept = entries;
  while (kept.length > MAX_EVENTS) kept = kept.slice(kept.length - MAX_EVENTS);
  let body = kept.map((entry) => JSON.stringify(entry)).join("\n");
  if (Buffer.byteLength(body) > MAX_BYTES) {
    // Drop from the front until the file fits the bound.
    while (kept.length > 1 && Buffer.byteLength(body) > MAX_BYTES) {
      kept = kept.slice(1);
      body = kept.map((entry) => JSON.stringify(entry)).join("\n");
    }
  }
  return kept;
}

function expired(entry: Entry, retentionDays: number | null, now: number): boolean {
  if (retentionDays === null) return false;
  if (entry.spooledAt === null) return true;
  return entry.spooledAt < new Date(now - retentionDays * 86_400_000).toISOString();
}

/**
 * Stores one observation under the project's current capture policy.
 *
 * The policy is applied here, before the write, because the collector cannot
 * undo content that has already reached disk. A paused or deleted project has
 * its observation skipped: keeping it would resurrect capture on resume or
 * re-registration. Unknown policy keeps the metadata and withholds content.
 * A busy spool is a bounded capture loss rather than a blocked agent.
 */
export function spool(event: NormalizedEvent): "stored" | "skipped" {
  const capture = retryCaptureState(event.projectId);
  if (capture.state === "paused" || capture.state === "purged") return "skipped";
  const safe =
    capture.state === "active" ? sanitizeEvent(event, capture.policy) : withholdContent(event);
  const entry: Entry = {
    spooledAt: new Date().toISOString(),
    epoch: capture.state === "active" ? capture.epoch : null,
    event: safe,
  };
  return withSpoolLock("skipped" as const, () => {
    writeEntries(spoolPath(), trim([...readEntries(spoolPath()), entry]));
    return "stored" as const;
  });
}

/**
 * Sends every spooled observation, revalidating each one against the project's
 * current generation, pause state, retention window and policy first.
 *
 * An entry from another generation belongs to a deleted or re-registered run
 * and is dropped. A paused project keeps its entries for resume. Successfully
 * delivered entries are removed; failures stay for the next drain.
 */
export async function drainSpool(
  send: (event: NormalizedEvent) => Promise<boolean>,
): Promise<{ sent: number; remaining: number; dropped: number }> {
  // Rotate under the lock so new hook writes never wait for delivery.
  const pending = withSpoolLock<Entry[]>([], () => {
    const entries = [...readEntries(spoolPath()), ...readEntries(drainingPath())];
    if (!entries.length) return [];
    // Persist before clearing the live file: a crash duplicates, never loses.
    writeEntries(drainingPath(), entries);
    writeEntries(spoolPath(), []);
    return entries;
  });
  let sent = 0;
  let dropped = 0;
  const remaining: Entry[] = [];
  for (const entry of pending) {
    const capture = retryCaptureState(entry.event.projectId);
    if (capture.state === "purged") {
      dropped++;
      continue;
    }
    if (capture.state !== "active") {
      // Unknown policy keeps metadata for a later drain; paused capture waits.
      remaining.push(entry);
      continue;
    }
    if (entry.epoch === null || entry.epoch !== capture.epoch) {
      dropped++;
      continue;
    }
    if (expired(entry, capture.retentionDays, Date.now())) {
      dropped++;
      continue;
    }
    // Policy may have tightened since the entry was written.
    const event = sanitizeEvent(entry.event, capture.policy);
    if (await send(event)) sent++;
    else remaining.push({ ...entry, event });
  }
  withSpoolLock<null>(null, () => {
    writeEntries(spoolPath(), trim([...readEntries(spoolPath()), ...remaining]));
    try {
      unlinkSync(drainingPath());
    } catch {}
    return null;
  });
  return { sent, remaining: remaining.length, dropped };
}

/** Applies the project's current policy and retention window to pending retries. */
export function cleanupProjectSpool(
  projectId: string,
  policy: CapturePolicy,
  retentionDays: number | null,
  now = Date.now(),
): { removed: number; rewritten: number } {
  return withSpoolLock({ removed: 0, rewritten: 0 }, () => {
    let removed = 0;
    let rewritten = 0;
    const clean = (entries: Entry[]) => {
      const kept: Entry[] = [];
      for (const entry of entries) {
        if (entry.event.projectId !== projectId) {
          kept.push(entry);
          continue;
        }
        // An entry without a generation cannot be proven safe after a lifecycle
        // change, so it is discarded instead of being guessed back to life.
        if (entry.epoch === null || expired(entry, retentionDays, now)) {
          removed++;
          continue;
        }
        const event = sanitizeEvent(entry.event, policy);
        if (JSON.stringify(event) !== JSON.stringify(entry.event)) rewritten++;
        kept.push({ ...entry, event });
      }
      return kept;
    };
    for (const path of [spoolPath(), drainingPath()]) {
      const entries = readEntries(path);
      if (!entries.length) continue;
      const kept = clean(entries);
      if (kept.length !== entries.length || rewritten)
        writeEntries(path, path === spoolPath() ? trim(kept) : kept);
    }
    return { removed, rewritten };
  });
}

/** Removes every pending retry for a deleted project. */
export function purgeProjectSpool(projectId: string): { removed: number } {
  return withSpoolLock({ removed: 0 }, () => {
    let removed = 0;
    for (const path of [spoolPath(), drainingPath()]) {
      const entries = readEntries(path);
      if (!entries.length) continue;
      const kept = entries.filter((entry) => {
        if (entry.event.projectId !== projectId) return true;
        removed++;
        return false;
      });
      if (kept.length !== entries.length) writeEntries(path, kept);
    }
    return { removed };
  });
}
