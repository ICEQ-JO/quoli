import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildReport } from "../server/report.ts";
import { buildReview, classifyPath, groupOf, reviewDiff, scoreRisk } from "../server/review.ts";
import type { SessionDetail, ToolCall } from "../shared/model.ts";
import { branchLine, prSummary } from "../shared/review.ts";

const START = "2026-01-01T00:00:00.000Z";
const at = (min: number) => new Date(Date.parse(START) + min * 60_000).toISOString();

function call(
  id: string,
  min: number,
  name: string,
  input: Record<string, unknown>,
  status: ToolCall["status"] = "ok",
  files: string[] = [],
): ToolCall {
  return {
    id,
    agentId: "main",
    name,
    category: name === "Bash" ? "run" : "edit",
    startedAt: at(min),
    endedAt: at(min),
    status,
    summary: "",
    files,
    input,
    output: null,
  };
}

const edit = (id: string, min: number, file: string, text = "a\nb\n") =>
  call(id, min, "Edit", { file_path: file, old_string: "x", new_string: text }, "ok", [file]);
const write = (id: string, min: number, file: string, text = "a\nb\n") =>
  call(id, min, "Write", { file_path: file, content: text }, "ok", [file]);
const bash = (id: string, min: number, command: string, status: ToolCall["status"] = "ok") =>
  call(id, min, "Bash", { command }, status);

function session(
  root: string,
  calls: ToolCall[],
  over: Partial<SessionDetail> = {},
): SessionDetail {
  return {
    id: "s1",
    root,
    title: "Add the thing",
    branch: null,
    startedAt: START,
    endedAt: null,
    turns: [
      { prompt: "Add the thing", at: START, toolCallIds: calls.map((c) => c.id), reply: null },
    ],
    toolCalls: calls,
    report: buildReport(calls, [], "t"),
    ...over,
  } as unknown as SessionDetail;
}

function sh(cwd: string, args: string[], date = "") {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
  });
}

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "quoli-review-"));
  sh(dir, ["init", "-q", "-b", "main"]);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/a.ts"), "one\ntwo\nthree\n");
  writeFileSync(join(dir, "README.md"), "hi\n");
  sh(dir, ["add", "."]);
  sh(dir, ["commit", "-q", "-m", "base"], "2020-01-01T00:00:00Z");
  return dir;
}

test("classifyPath and groupOf", () => {
  assert.equal(classifyPath("db/schema.sql"), "schema");
  assert.equal(classifyPath("supabase/migrations/001_x.sql"), "schema");
  assert.equal(classifyPath("pnpm-lock.yaml"), "lockfile");
  assert.equal(classifyPath("package.json"), "config");
  assert.equal(classifyPath("tests/a.test.ts"), "test");
  assert.equal(classifyPath("docs/api.md"), "docs");
  assert.equal(classifyPath("src/a.ts"), "code");
  assert.equal(groupOf("packages/api/src/x.ts"), "packages/api");
  assert.equal(groupOf("server/a.ts"), "server");
  assert.equal(groupOf("README.md"), "(root)");
});

test("risk ranking: schema and unverified edits outrank plain, docs rank low", () => {
  const base = {
    kind: "code" as const,
    timesEdited: 1,
    editedAfterTest: false,
    failedAfter: false,
    rewritten: false,
    noTest: false,
    lines: 5,
  };
  const plain = scoreRisk(base);
  const schema = scoreRisk({ ...base, kind: "schema" });
  const after = scoreRisk({ ...base, editedAfterTest: true, failedAfter: true });
  const docs = scoreRisk({ ...base, kind: "docs", editedAfterTest: true, failedAfter: true });
  assert.equal(plain.score, 0);
  assert.equal(plain.level, "low");
  assert.ok(schema.score > plain.score && schema.level === "medium");
  assert.equal(after.level, "high");
  assert.deepEqual(
    after.reasons.map((r) => r.label),
    ["failed run after", "edited after tests"],
  );
  assert.ok(docs.score < after.score);
  assert.ok(
    scoreRisk({ ...base, timesEdited: 6 }).score > scoreRisk({ ...base, timesEdited: 3 }).score,
  );
});

test("git review: committed + uncommitted + untracked non-code files, sorted by risk", () => {
  const dir = repo();
  try {
    // During the session: a commit that edits a.ts, then uncommitted work.
    writeFileSync(join(dir, "src/a.ts"), "one\nTWO\nthree\nfour\n");
    sh(dir, ["commit", "-qam", "tweak a"], at(5));
    writeFileSync(join(dir, "README.md"), "hi\nthere\n");
    writeFileSync(join(dir, "schema.sql"), "create table t (id int);\n");
    const calls = [
      edit("e1", 1, "src/a.ts"),
      bash("t1", 2, "pnpm test"),
      edit("e2", 6, "src/a.ts"),
      write("w1", 7, "schema.sql", "create table t (id int);\n"),
      edit("e3", 8, "gone.ts"),
      bash("b1", 9, "pnpm tsc --noEmit", "failed"),
    ];
    const r = buildReview(session(dir, calls), true);
    assert.equal(r.source, "git");
    assert.deepEqual(r.files.map((f) => f.path).sort(), ["README.md", "schema.sql", "src/a.ts"]);
    // Git counts, not the edit inputs: a.ts is +2 -1 in Git but the edits recorded +4.
    const a = r.files.find((f) => f.path === "src/a.ts");
    assert.equal(a?.added, 2);
    assert.equal(a?.removed, 1);
    assert.equal(a?.editAdded, 4);
    assert.equal(a?.status, "modified");
    assert.ok(a?.editedAfterTest && a.failedAfter);
    const sql = r.files.find((f) => f.path === "schema.sql");
    assert.equal(sql?.status, "added");
    assert.equal(sql?.kind, "schema");
    assert.equal(sql?.added, 1);
    const readme = r.files.find((f) => f.path === "README.md");
    assert.equal(readme?.outsideEdits, true);
    // Highest risk first (a schema edited after tests and a failed check); the file the agent
    // never edited ranks last.
    assert.equal(r.files[0].path, "schema.sql");
    assert.ok(r.files[0].risk > (a?.risk ?? 0));
    assert.equal(r.files.at(-1)?.path, "README.md");
    assert.deepEqual(r.noNetChange, ["gone.ts"]);
    assert.equal(r.tests.ran, true);
    // Branch panel.
    assert.equal(r.branch?.head, "main");
    assert.equal(r.branch?.base, null);
    assert.equal(r.branch?.commits?.length, 1);
    assert.equal(r.branch?.commits?.[0].subject, "tweak a");
    assert.equal(r.branch?.uncommitted, 2);
    assert.equal(r.branch?.unpushed, null);
    assert.equal(branchLine(r.branch), "main · 1 commit · 2 uncommitted");
    // Diffs: committed + uncommitted against where the session began; untracked is synthesized.
    assert.match(reviewDiff(session(dir, calls), "src/a.ts")?.gitDiff ?? "", /\+TWO/);
    assert.match(reviewDiff(session(dir, calls), "schema.sql")?.gitDiff ?? "", /\+create table/);
    assert.equal(
      reviewDiff(session(dir, calls), "schema.sql")?.source,
      "create table t (id int);\n",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("git review: base branch, unpushed count and a Write over an existing file", () => {
  const dir = repo();
  const remote = mkdtempSync(join(tmpdir(), "quoli-review-remote-"));
  try {
    sh(remote, ["init", "-q", "--bare", "-b", "main"]);
    sh(dir, ["remote", "add", "origin", remote]);
    sh(dir, ["push", "-q", "-u", "origin", "main"]);
    sh(dir, ["checkout", "-q", "-b", "feature/x"]);
    sh(dir, ["push", "-q", "-u", "origin", "feature/x"]);
    writeFileSync(join(dir, "src/a.ts"), "new content\n");
    sh(dir, ["commit", "-qam", "rewrite a"], at(3));
    const calls = [write("w1", 1, "src/a.ts", "new content\n")];
    const r = buildReview(session(dir, calls, { branch: "feature/x" }), true);
    assert.equal(r.branch?.base, "main");
    assert.equal(r.branch?.unpushed, 1);
    assert.equal(r.branch?.uncommitted, 0);
    assert.equal(r.branch?.upstream, "origin/feature/x");
    assert.equal(branchLine(r.branch), "main → feature/x · 1 commit · 0 uncommitted · 1 unpushed");
    assert.equal(r.files[0].rewritten, true);
    assert.ok(r.files[0].reasons.some((x) => x.label === "rewritten"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  }
});

test("review falls back to recorded edits: repo missing, other branch, not registered", () => {
  const calls = [edit("e1", 1, "src/a.ts"), edit("e2", 2, "docs/x.md")];
  const missing = buildReview(session("/nonexistent/quoli-review", calls), true);
  assert.equal(missing.source, "edits");
  assert.match(missing.note ?? "", /not on this computer/);
  assert.equal(missing.branch, null);
  assert.equal(missing.files.length, 2);
  assert.equal(missing.files[0].status, null);
  assert.equal(missing.files[0].added, 2);
  assert.equal(reviewDiff(session("/nonexistent/quoli-review", calls), "src/a.ts"), null);

  const dir = repo();
  try {
    const other = buildReview(session(dir, calls, { branch: "feature/gone" }), true);
    assert.equal(other.source, "edits");
    assert.match(other.note ?? "", /now on main, not feature\/gone/);
    assert.equal(other.branch?.head, "main");
    assert.equal(buildReview(session(dir, calls), false).source, "edits");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a session that changed nothing has an empty review", () => {
  const dir = repo();
  try {
    const r = buildReview(session(dir, [bash("t1", 1, "pnpm test")]), true);
    assert.equal(r.source, "git");
    assert.equal(r.files.length, 0);
    assert.equal(r.tests.ran, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PR summary: title, files, commands, notes", () => {
  const calls = [
    edit("e1", 1, "db/schema.sql"),
    bash("t1", 2, "pnpm test", "failed"),
    edit("e2", 3, "src/a.ts"),
  ];
  const s = session("/nonexistent/quoli-review", calls);
  const r = buildReview(s, true);
  const md = prSummary("Add the thing", r, s.report.commands);
  assert.match(md, /^# Add the thing\n/);
  assert.match(md, /## What changed\n\n2 files, \+4 -2 \(from the agent's recorded edits\)\./);
  assert.match(md, /- `db\/schema\.sql` \(\+2 -1\)/);
  assert.match(md, /- failed: `pnpm test`/);
  assert.match(md, /## Review notes[\s\S]*`db\/schema\.sql`: schema/);
  assert.match(md, /The last test run failed\./);
  const none = prSummary("", buildReview(session("/nonexistent/x", []), true), []);
  assert.match(none, /^# Untitled change/);
  assert.match(none, /No files changed\./);
  assert.match(none, /No test command was run\./);
});

test("clean tree with recorded edits lists the edits and says why; commands alone credit nothing", () => {
  const dir = repo();
  try {
    const r = buildReview(session(dir, [edit("e1", 1, "src/a.ts")]), true);
    assert.equal(r.source, "edits");
    assert.equal(r.files.length, 1);
    assert.match(r.note ?? "", /no difference/);
    assert.equal(r.branch?.uncommitted, 0);
    assert.equal(buildReview(session(dir, [bash("t1", 1, "pnpm test")]), true).files.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
