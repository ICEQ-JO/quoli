import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { attachSessions, gitState, parseLimit, reportedCommits } from "../server/gitstate.ts";
import type { Commit } from "../shared/model.ts";
import { assignLanes } from "../web/src/lenses/git/lanes.ts";

const c = (sha: string, ...parents: string[]) => ({ sha, parents });

test("lanes: linear history stays in one lane", () => {
  const { rows, width } = assignLanes([c("c", "b"), c("b", "a"), c("a")]);
  assert.equal(width, 1);
  assert.deepEqual(
    rows.map((r) => r.col),
    [0, 0, 0],
  );
});

test("lanes: a side branch gets its own lane and rejoins at the fork", () => {
  const { rows, width } = assignLanes([c("d", "b"), c("e", "b"), c("b", "a"), c("a")]);
  assert.equal(width, 2);
  assert.equal(rows[0].col, 0);
  assert.equal(rows[1].col, 1);
  assert.equal(rows[2].col, 0);
  assert.deepEqual(
    rows[1].out.map((s) => s.lane),
    [0],
  ); // the side lane curves into the trunk lane
});

test("lanes: a merge opens a lane for its second parent and closes it at the fork", () => {
  const { rows } = assignLanes([c("m", "b", "f"), c("f", "a"), c("b", "a"), c("a")]);
  assert.equal(rows[0].col, 0);
  assert.deepEqual(
    rows[0].out.map((s) => s.lane),
    [0, 1],
  );
  assert.equal(rows[1].col, 1);
  assert.deepEqual(
    rows[2].out.map((s) => s.lane),
    [1],
  ); // b curves across to a's lane
  assert.equal(rows[3].col, 1);
  assert.equal(rows[3].into.length, 1);
});

test("lanes: a parent beyond the page leaves the lane open", () => {
  const { rows } = assignLanes([c("b", "a-not-listed")]);
  assert.equal(rows[0].out[0].lane, 0);
});

test("commit output parsing", () => {
  assert.deepEqual(reportedCommits("[main abc1234] Fix thing\n 1 file changed"), ["abc1234"]);
  assert.deepEqual(reportedCommits("[feature/x (root-commit) abc1234] init"), ["abc1234"]);
  assert.deepEqual(reportedCommits("On branch main\nnothing to commit"), []);
});

test("sessions attach only through a git commit call's reported sha", () => {
  const commits: Commit[] = [
    { sha: "abc1234", parents: [], subject: "", author: "", at: "", refs: [] },
    { sha: "def5678", parents: [], subject: "", author: "", at: "", refs: [] },
  ];
  attachSessions(commits, [
    {
      id: "s1",
      toolCalls: [
        { name: "Bash", input: { command: "git commit -m x" }, output: "[main abc1234567] x" },
        { name: "Bash", input: { command: "echo" }, output: "[main def5678] spoof" },
      ],
    },
  ]);
  assert.deepEqual(commits[0].sessions, ["s1"]);
  assert.equal(commits[1].sessions, undefined);
});

test("pagination: limit clamps and hasMore reflects older commits", () => {
  assert.equal(parseLimit(null), 200);
  assert.equal(parseLimit("99999"), 2000);
  assert.equal(parseLimit("0"), 1);
  const dir = mkdtempSync(join(tmpdir(), "quoli-git-"));
  try {
    const run = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
    run("init", "-q", "-b", "main");
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(dir, "f"), String(i));
      run("add", "f");
      run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", `c${i}`);
    }
    const page = gitState(dir, 3);
    assert.equal(page.commits.length, 3);
    assert.equal(page.hasMore, true);
    assert.equal(gitState(dir, 5).hasMore, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
