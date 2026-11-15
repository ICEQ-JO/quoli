import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findCollisions, type MergeCheck, mergeCheck } from "../server/collisions.ts";
import type { SessionDetail } from "../shared/model.ts";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const min = (m: number) => new Date(NOW - m * 60_000).toISOString();

function session(
  id: string,
  o: {
    root?: string;
    branch?: string | null;
    from: number;
    to: number;
    live?: boolean;
    edits: string[];
  },
) {
  return {
    id,
    title: id,
    agent: "claude-code",
    root: o.root ?? "/nowhere/shop",
    branch: o.branch === undefined ? "main" : o.branch,
    startedAt: min(o.from),
    lastAt: min(o.to),
    live: o.live ?? false,
    files: Object.fromEntries(o.edits.map((f) => [f, { read: 1, edited: 1, toolCallIds: [] }])),
  } as unknown as SessionDetail;
}

const clean: typeof mergeCheck = () => ({ merged: false, conflicts: [] });

test("parallel branches that edited the same file collide, with Git's conflict list", () => {
  const conflict = (): MergeCheck => ({ merged: false, conflicts: ["db.sql"] });
  const found = findCollisions(
    [
      session("a", { branch: "feature/a", from: 90, to: 60, edits: ["db.sql", "x.ts"] }),
      session("b", { branch: "feature/b", from: 20, to: 1, live: true, edits: ["db.sql"] }),
    ],
    NOW,
    conflict,
  );
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].files, ["db.sql"]);
  assert.deepEqual(found[0].conflicts, ["db.sql"]);
});

test("work done one after another on one branch is not a collision", () => {
  const found = findCollisions(
    [
      session("a", { from: 120, to: 90, edits: ["x.ts"] }),
      session("b", { from: 30, to: 5, edits: ["x.ts"] }),
    ],
    NOW,
    () => assert.fail("no Git check for one branch"),
  );
  assert.equal(found.length, 0);
});

test("two agents in one checkout at the same time collide without a Git check", () => {
  const found = findCollisions(
    [
      session("a", { from: 30, to: 2, live: true, edits: ["x.ts"] }),
      session("b", { from: 20, to: 1, live: true, edits: ["x.ts", "y.ts"] }),
    ],
    NOW,
    () => assert.fail("no Git check for one branch"),
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].conflicts, null);
});

test("merged branches, other repositories, old sessions and disjoint edits are left out", () => {
  const merged = (): MergeCheck => ({ merged: true, conflicts: null });
  assert.equal(
    findCollisions(
      [
        session("a", { branch: "feature/a", from: 300, to: 200, edits: ["x.ts"] }),
        session("b", { branch: "main", from: 60, to: 30, edits: ["x.ts"] }),
      ],
      NOW,
      merged,
    ).length,
    0,
    "merged",
  );
  assert.equal(
    findCollisions(
      [
        session("a", { root: "/nowhere/one", from: 30, to: 1, edits: ["x.ts"] }),
        session("b", { root: "/nowhere/two", from: 30, to: 1, edits: ["x.ts"] }),
      ],
      NOW,
      clean,
    ).length,
    0,
    "other repositories",
  );
  assert.equal(
    findCollisions(
      [
        session("a", { branch: "feature/a", from: 3000, to: 2000, edits: ["x.ts"] }),
        session("b", { branch: "feature/b", from: 30, to: 1, edits: ["x.ts"] }),
      ],
      NOW,
      clean,
    ).length,
    0,
    "older than a day",
  );
  assert.equal(
    findCollisions(
      [
        session("a", { from: 30, to: 1, edits: ["x.ts"] }),
        session("b", { from: 30, to: 1, edits: ["y.ts"] }),
      ],
      NOW,
      clean,
    ).length,
    0,
    "different files",
  );
});

test("sessions in a removed Claude Code worktree group with their repository; live pairs first", () => {
  const found = findCollisions(
    [
      session("old-a", { branch: "feature/a", from: 600, to: 500, edits: ["x.ts"] }),
      session("old-b", { branch: "feature/b", from: 400, to: 300, edits: ["x.ts"] }),
      session("live", {
        root: "/nowhere/shop/.claude/worktrees/w1",
        branch: "feature/c",
        from: 10,
        to: 1,
        live: true,
        edits: ["x.ts"],
      }),
    ],
    NOW,
    clean,
  );
  assert.equal(found.length, 3);
  assert.ok(found[0].a.live || found[0].b.live, "a pair with a live session comes first");
  assert.ok(found.every((c) => c.repo === "shop"));
});

test("mergeCheck asks Git: conflicting, clean and already merged branches", () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "quoli-merge-")));
  const sh = (...args: string[]) =>
    execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args], {
      cwd: repo,
      stdio: "ignore",
    });
  try {
    sh("init", "-q", "-b", "main");
    writeFileSync(join(repo, "f.txt"), "one\n");
    sh("add", "-A");
    sh("commit", "-qm", "base");
    sh("checkout", "-qb", "a");
    writeFileSync(join(repo, "f.txt"), "one\nfrom a\n");
    sh("commit", "-qam", "a");
    sh("checkout", "-q", "main");
    sh("checkout", "-qb", "b");
    writeFileSync(join(repo, "f.txt"), "one\nfrom b\n");
    sh("commit", "-qam", "b");
    sh("checkout", "-q", "main");
    sh("checkout", "-qb", "c");
    writeFileSync(join(repo, "g.txt"), "other\n");
    sh("add", "-A");
    sh("commit", "-qm", "c");
    assert.deepEqual(mergeCheck(repo, "a", "b"), { merged: false, conflicts: ["f.txt"] });
    assert.deepEqual(mergeCheck(repo, "a", "c"), { merged: false, conflicts: [] });
    assert.deepEqual(mergeCheck(repo, "main", "a"), { merged: true, conflicts: null });
    assert.deepEqual(mergeCheck(repo, "a", "missing"), { merged: false, conflicts: null });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
