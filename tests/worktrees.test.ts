import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { groupRoot, mainCheckout } from "../server/worktrees.ts";

const sh = (cwd: string, args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd });

test("a linked worktree, live or removed, groups under its repository", () => {
  const main = realpathSync.native(mkdtempSync(join(tmpdir(), "quoli-wt-")));
  try {
    sh(main, ["init", "-q", "-b", "main"]);
    writeFileSync(join(main, "a.txt"), "a\n");
    sh(main, ["add", "."]);
    sh(main, ["commit", "-qm", "base"]);
    const wt = join(main, ".claude", "worktrees", "agent-1");
    sh(main, ["worktree", "add", "-q", "-b", "agent-1", wt]);

    assert.equal(mainCheckout(wt), main);
    assert.equal(mainCheckout(main), null, "a main checkout stands on its own");
    assert.equal(groupRoot(wt, new Set([main, wt])), main);
    assert.equal(groupRoot(wt, new Set([wt])), null, "only under a repository Quoli knows");
    const gone = join(main, ".claude", "worktrees", "agent-gone");
    assert.equal(groupRoot(gone, new Set([main, gone])), main, "a removed agent worktree too");
    assert.equal(mainCheckout("/nowhere/else"), null);
  } finally {
    rmSync(main, { recursive: true, force: true });
  }
});
