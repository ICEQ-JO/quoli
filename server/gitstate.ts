import type { Branch, Commit, GitState } from "../shared/model.ts";
import { git } from "./ingest.ts";

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
  return { branches, commits, changed, hasMore };
}
