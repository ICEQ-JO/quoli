import { execFileSync } from "node:child_process";
import type { AgentKind } from "../shared/model.ts";
import { adapterFor } from "./adapters.ts";
import type { Store } from "./db.ts";
import { syncTranscript } from "./transcript.ts";

const rootCache = new Map<string, string>();

export function repoRoot(cwd: string): string {
  let root = rootCache.get(cwd);
  if (!root) {
    root = git(cwd, ["rev-parse", "--show-toplevel"]) ?? cwd;
    rootCache.set(cwd, root);
  }
  return root;
}

export function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

const SECRETS = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/** Best-effort removal of common credential shapes before anything is stored. */
export function redact(text: string): string {
  return SECRETS.reduce((t, re) => t.replace(re, "[redacted]"), text);
}

/**
 * Stores one hook payload from `agent`, after its adapter maps it into the shared shape.
 * Returns the recorded event's session id (each agent names it differently on the wire), or
 * false when the agent has no adapter or the payload is not a usable hook event.
 */
export function ingest(
  store: Store,
  raw: Record<string, unknown>,
  at = new Date().toISOString(),
  onNewRoot?: () => void,
  agent: AgentKind = "claude-code",
): string | false {
  const adapter = adapterFor(agent);
  const normalized = adapter?.normalize(raw);
  if (!adapter || !normalized || !recordEvent(store, normalized, agent, at, onNewRoot))
    return false;
  const usage = adapter.usage?.(normalized, at);
  if (usage) store.upsertUsage(usage);
  return normalized.session_id as string;
}

/**
 * Stores one payload that is already in the shared shape. Used by `ingest` after an adapter
 * ran, and by the synthetic demo. Claude Code events stay exactly as captured; any other agent's
 * events carry `quoli_agent`, and an event without it reads as Claude Code.
 */
export function recordEvent(
  store: Store,
  normalized: Record<string, unknown>,
  agent: AgentKind,
  at = new Date().toISOString(),
  onNewRoot?: () => void,
) {
  const payload: Record<string, unknown> =
    agent === "claude-code" ? normalized : { ...normalized, quoli_agent: agent };
  const sessionId = payload.session_id;
  const event = payload.hook_event_name;
  const cwd = payload.cwd;
  if (typeof sessionId !== "string" || typeof event !== "string" || typeof cwd !== "string") {
    return false;
  }
  const root = repoRoot(cwd);
  if (event === "SessionStart" && payload.quoli_branch === undefined) {
    payload.quoli_branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  }
  const clean = store.settings().redact ? JSON.parse(redact(JSON.stringify(payload))) : payload;
  const fresh = !store.hasRoot(root);
  store.append({ sessionId, root, event, at, payload: clean });

  // Token usage comes from Claude Code's transcript format; other agents report it their own way.
  if (agent === "claude-code") {
    if (typeof payload.transcript_path === "string") {
      syncTranscript(store, payload.transcript_path, sessionId, "main");
    }
    if (typeof payload.agent_transcript_path === "string" && typeof payload.agent_id === "string") {
      syncTranscript(store, payload.agent_transcript_path, sessionId, payload.agent_id);
    }
  }
  if (fresh) onNewRoot?.();
  return true;
}
