import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type {
  Branch,
  Commit,
  CommitDetail,
  CommitFile,
  GitState,
  Remote,
} from "../shared/model.ts";
import { git } from "./ingest.ts";

export const DIFF_LIMIT = 300_000;
const WEB_HOSTS = /^(github\.com|gitlab\.com|bitbucket\.org)$/;

/**
 * A remote URL as `host/owner/repo` with any user, password or token dropped, plus a browser
 * link for well-known hosts. Local paths and unrecognised URLs give nulls.
 */
export function describeRemote(name: string, url: string): Remote {
  let host: string | null = null;
  let path: string | null = null;
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(url);
  if (/^[a-z+]+:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      if (u.protocol !== "file:") {
        host = u.hostname;
        path = u.pathname.replace(/^\/+/, "");
      }
    } catch {}
  } else if (scp) {
    host = scp[1];
    path = scp[2];
  }
  if (!host || !path) return { name, display: null, web: null };
  path = path.replace(/\.git$/, "").replace(/\/+$/, "");
  const display = `${host}/${path}`;
  return { name, display, web: WEB_HOSTS.test(host) ? `https://${display}` : null };
}

function remotes(root: string): Remote[] {
  return (git(root, ["remote", "-v"]) ?? "")
    .split("\n")
    .filter((l) => l.endsWith("(fetch)"))
    .map((l) => {
      const [name, url] = l.split(/\s+/);
      return describeRemote(name ?? "", url ?? "");
    });
}

function lastFetch(root: string): string | null {
  const p = git(root, ["rev-parse", "--git-path", "FETCH_HEAD"]);
  if (!p) return null;
  try {
    return statSync(isAbsolute(p) ? p : join(root, p)).mtime.toISOString();
  } catch {
    return null;
  }
}

/** Files and diff of one commit. `sha` must be hex; anything else returns null. */
export function commitDetail(root: string, sha: string): CommitDetail | null {
  if (!/^[0-9a-f]{4,40}$/.test(sha)) return null;
  const stat = git(root, ["show", "--no-color", "--format=", "--numstat", "-M", sha]);
  if (stat === null) return null;
  const files: CommitFile[] = stat
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [a, r, ...rest] = line.split("\t");
      return {
        path: rest.join("\t"),
        added: a === "-" ? null : Number(a),
        removed: r === "-" ? null : Number(r),
      };
    });
  let diff: string | null = null;
  try {
    diff = execFileSync("git", ["show", "--no-color", "--format=", "-M", sha], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {}
  const truncated = (diff?.length ?? 0) > DIFF_LIMIT;
  return { sha, files, diff: diff && truncated ? diff.slice(0, DIFF_LIMIT) : diff, truncated };
}

export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 2000;

/** Parse the `limit` query parameter: default 200, clamped to 1..2000. */
export function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

/** The minimal slice of a session that commit attribution needs. */
export interface CommitSource {
  id: string;
  toolCalls: { name: string; input: unknown; output: string | null }[];
}

/**
 * Commit shas a Bash tool output reports creating: `[main abc1234] msg`,
 * `[feature/x (root-commit) abc1234] msg`. Recorded basis only.
 */
export function reportedCommits(output: string): string[] {
  const out: string[] = [];
  for (const m of output.matchAll(/\[[^\][\n]*? ([0-9a-f]{7,40})\]/g)) out.push(m[1]);
  return out;
}

const commandOf = (input: unknown): string =>
  typeof input === "object" && input !== null && "command" in input
    ? String((input as { command: unknown }).command)
    : "";

/** Attach `sessions` to commits whose creation a recorded `git commit` call reported. */
export function attachSessions(commits: Commit[], sessions: CommitSource[]): void {
  for (const s of sessions) {
    for (const call of s.toolCalls) {
      if (
        call.name !== "Bash" ||
        !call.output ||
        !/\bgit\b[^\n]*\bcommit\b/.test(commandOf(call.input))
      )
        continue;
      for (const sha of reportedCommits(call.output)) {
        const c = commits.find((x) => x.sha.startsWith(sha) || sha.startsWith(x.sha));
        if (!c) continue;
        c.sessions ??= [];
        if (!c.sessions.includes(s.id)) c.sessions.push(s.id);
      }
    }
  }
}

export function gitState(
  root: string,
  limit = DEFAULT_LIMIT,
  sessions: CommitSource[] = [],
): GitState {
  const branches: Branch[] = [];
  const refs = git(root, [
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname:short)%09%(objectname:short)%09%(upstream:short)%09%(upstream:track)%09%(committerdate:iso-strict)%09%(HEAD)",
    "refs/heads",
  ]);
  for (const line of (refs ?? "").split("\n")) {
    if (!line) continue;
    const [name, head, upstream, track, at, current] = line.split("\t");
    branches.push({
      name,
      head,
      upstream: upstream || null,
      ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
      behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
      lastCommitAt: at,
      current: current === "*",
    });
  }
  const commits: Commit[] = [];
  const log = git(root, [
    "log",
    "--branches",
    "--topo-order",
    "-n",
    String(limit + 1),
    "--format=%h%x09%p%x09%an%x09%aI%x09%D%x09%s",
  ]);
  for (const line of (log ?? "").split("\n")) {
    if (!line) continue;
    const [sha, parents, author, at, refs, ...subject] = line.split("\t");
    commits.push({
      sha,
      parents: parents ? parents.split(" ") : [],
      author,
      at,
      refs: refs
        ? refs
            .split(", ")
            .map((r) => r.replace(/^HEAD -> /, ""))
            .filter((r) => r !== "HEAD")
        : [],
      subject: subject.join("\t"),
    });
  }
  const hasMore = commits.length > limit;
  if (hasMore) commits.length = limit;
  attachSessions(commits, sessions);
  const changed = (git(root, ["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).length;
  return {
    branches,
    remotes: remotes(root),
    lastFetch: lastFetch(root),
    commits,
    changed,
    hasMore,
  };
}
