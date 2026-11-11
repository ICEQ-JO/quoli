import { execFileSync } from "node:child_process";
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

/** Stores one Claude Code hook payload. Returns false when it is not a usable hook event. */
export function ingest(
  store: Store,
  payload: Record<string, unknown>,
  at = new Date().toISOString(),
  onNewRoot?: () => void,
) {
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

  if (typeof payload.transcript_path === "string") {
    syncTranscript(store, payload.transcript_path, sessionId, "main");
  }
  if (typeof payload.agent_transcript_path === "string" && typeof payload.agent_id === "string") {
    syncTranscript(store, payload.agent_transcript_path, sessionId, payload.agent_id);
  }
  if (fresh) onNewRoot?.();
  return true;
}
