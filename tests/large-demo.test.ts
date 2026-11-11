import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildLargeRepo } from "../server/large-demo.ts";

test("the large synthetic repo has real scale: 2,000+ files, 500+ commits, branches and merges", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-large-"));
  try {
    const started = Date.now();
    buildLargeRepo(dir);
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    assert.ok(git("ls-files").split("\n").length > 2000);
    assert.ok(Number(git("rev-list", "--all", "--count")) >= 500);
    assert.ok(git("branch", "--format=%(refname:short)").split("\n").length >= 6);
    assert.ok(Number(git("rev-list", "--merges", "--count", "main")) >= 3);
    assert.ok(Date.now() - started < 30_000, "builds quickly");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
