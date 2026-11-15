import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import type { Collision, CollisionSide, SessionDetail } from "../shared/model.ts";
import { projectId } from "./db.ts";
import { git } from "./ingest.ts";
import { mainCheckout } from "./worktrees.ts";

const DAY = 86_400_000;

/** What Git says about merging branch `b` into branch `a` of the repository at `repo`. */
export interface MergeCheck {
  /** One branch already contains the other: their edits no longer compete. */
  merged: boolean;
  /** Files that would conflict; null when Git could not tell. */
  conflicts: string[] | null;
}

const checks = new Map<string, MergeCheck>();

/**
 * `git merge-tree` (Git 2.38+) between two branches, without touching any checkout. Cached by
 * the branches' heads, so it runs again only when one of them gets a new commit.
 */
export function mergeCheck(repo: string, a: string, b: string): MergeCheck {
  const head = (branch: string) =>
    git(repo, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`]);
  const [ha, hb] = [head(a), head(b)];
  if (!ha || !hb) return { merged: false, conflicts: null };
  const key = `${repo}\0${ha}\0${hb}`;
  const known = checks.get(key);
  if (known) return known;
  const ancestor = (x: string, y: string) =>
    git(repo, ["merge-base", "--is-ancestor", x, y]) !== null;
  let result: MergeCheck;
  if (ancestor(ha, hb) || ancestor(hb, ha)) result = { merged: true, conflicts: null };
  else {
    // Exit 0: merges cleanly; exit 1: conflicts, listed after the new tree's id.
    const run = spawnSync(
      "git",
      ["merge-tree", "--write-tree", "--name-only", "--no-messages", ha, hb],
      { cwd: repo, encoding: "utf8", timeout: 5000 },
    );
    const lines = (run.stdout ?? "").split("\n").filter(Boolean);
    result = {
      merged: false,
      conflicts:
        run.status === 0
          ? []
          : run.status === 1 && /^[0-9a-f]{40,64}$/.test(lines[0] ?? "")
            ? lines.slice(1)
            : null,
    };
  }
  checks.set(key, result);
  return result;
}

const side = (s: SessionDetail): CollisionSide => ({
  sessionId: s.id,
  title: s.title,
  agent: s.agent,
  branch: s.branch,
  root: s.root,
  live: s.live,
  lastAt: s.lastAt,
});

const editedFiles = (s: SessionDetail) =>
  new Set(
    Object.entries(s.files)
      .filter(([, f]) => f.edited > 0)
      .map(([path]) => path),
  );

/**
 * Sessions from the last day, in the same repository, that edited the same files while running at
 * the same time or on two branches that are not merged into each other yet. Work done one after
 * another on one branch is not a collision. Live pairs come first, then the most recent.
 */
export function findCollisions(
  sessions: SessionDetail[],
  now = Date.now(),
  check: typeof mergeCheck = mergeCheck,
): Collision[] {
  const groups = new Map<string, SessionDetail[]>();
  for (const s of sessions) {
    if (now - Date.parse(s.lastAt) > DAY) continue;
    const repo = mainCheckout(s.root) ?? s.root;
    groups.set(repo, [...(groups.get(repo) ?? []), s]);
  }
  const found: Collision[] = [];
  for (const [repo, list] of groups) {
    const edits = new Map(list.map((s) => [s.id, editedFiles(s)]));
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        const files = [...(edits.get(a.id) ?? [])].filter((f) => edits.get(b.id)?.has(f)).sort();
        if (!files.length) continue;
        const together =
          Date.parse(a.startedAt) <= Date.parse(b.lastAt) &&
          Date.parse(b.startedAt) <= Date.parse(a.lastAt);
        const branches = Boolean(a.branch && b.branch && a.branch !== b.branch);
        if (!together && !branches) continue;
        let conflicts: string[] | null = null;
        if (branches && a.branch && b.branch) {
          const m = check(repo, a.branch, b.branch);
          if (m.merged && !together) continue;
          conflicts = m.conflicts;
        }
        found.push({
          projectId: projectId(repo),
          repo: basename(repo),
          a: side(a),
          b: side(b),
          files,
          conflicts,
        });
      }
  }
  const rank = (c: Collision) => (c.a.live || c.b.live ? 1 : 0);
  const latest = (c: Collision) => Math.max(Date.parse(c.a.lastAt), Date.parse(c.b.lastAt));
  return found.sort((x, y) => rank(y) - rank(x) || latest(y) - latest(x));
}
