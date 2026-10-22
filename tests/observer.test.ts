import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { RepositoryObserver } from "../apps/collector/src/observer";
import { captureRepository } from "../packages/repository/src/index";
import { defaultPolicy } from "../packages/schema/src/index";
import { Store } from "../packages/storage/src/index";

function fixture(code = true, maxBytes = 50 * 1024 * 1024) {
  const base = mkdtempSync(join(tmpdir(), "quoli-observer-"));
  const root = join(base, "repo"),
    data = join(base, "data");
  mkdirSync(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.name", "ICEQ-JO");
  git("config", "user.email", "151853839+ICEQ-JO@users.noreply.github.com");
  writeFileSync(join(root, "example.ts"), "export const value = 1;\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "Synthetic initial fixture");
  const store = new Store(join(data, "traceframe.sqlite"), { maxEvents: 10000, maxBytes });
  store.registerLocalRepository(
    "project",
    "Observer fixture",
    root,
    { ...defaultPolicy, code },
    false,
  );
  const observer = new RepositoryObserver(store, data);
  const count = () => store.usage("project").snapshots;
  const state = () => store.latestRepositoryState("project")?.payload;
  return {
    root,
    data,
    store,
    observer,
    git,
    count,
    state,
    async close() {
      await observer.stop();
      store.close();
      rmSync(base, { recursive: true, force: true });
    },
  };
}

test("opt-in repository observation captures edits, commits and branches without agent hooks", async () => {
  const f = fixture();
  try {
    await f.observer.poll();
    assert.equal(f.count(), 0);
    f.store.enableObservation("project");
    const index = readFileSync(join(f.root, ".git/index"));
    await f.observer.poll();
    assert.equal(f.count(), 1);
    assert.equal(f.state()?.kind === "repository_state" && f.state()?.kind, "repository_state");
    const session = f.store.sessions("project")[0];
    assert.equal(session.kind, "repository");
    assert.match(session.title, /^Repository history/);
    assert.equal(f.store.latestRepositoryState("project")?.source, "repository");
    assert.deepEqual(readFileSync(join(f.root, ".git/index")), index);
    assert.equal(existsSync(join(f.root, ".claude/settings.json")), false);
    writeFileSync(join(f.root, "example.ts"), "export const value = 2;\n");
    await f.observer.poll();
    assert.equal(f.count(), 2);
    assert.match(
      f.store.latestObservedSnapshot("project")?.files[0].content.text ?? "",
      /value = 2/,
    );
    const head = f.git("rev-parse", "HEAD");
    f.git("add", ".");
    f.git("commit", "--quiet", "-m", "Synthetic follow-up");
    await f.observer.poll();
    assert.equal(f.count(), 3);
    const commit = f.state();
    assert.equal(commit?.kind, "repository_state");
    if (commit?.kind !== "repository_state") throw new Error("State missing");
    assert.equal(commit.previousHead, head);
    assert.equal(commit.transition, "fast_forward");
    assert.deepEqual(commit.commits, [f.git("rev-parse", "HEAD")]);
    f.git("switch", "--quiet", "-c", "other");
    await f.observer.poll();
    assert.equal(f.count(), 4);
    const branch = f.state();
    if (branch?.kind !== "repository_state") throw new Error("State missing");
    assert.equal(branch.branch, "other");
    assert.deepEqual(branch.commits, []);
    f.git("reset", "--quiet", "--hard", head);
    await f.observer.poll();
    const rewritten = f.state();
    if (rewritten?.kind !== "repository_state") throw new Error("State missing");
    assert.equal(rewritten.transition, "diverged");
    assert.deepEqual(rewritten.commits, []);
  } finally {
    await f.close();
  }
});

test("unchanged samples are deduplicated across observer and store restarts", async () => {
  const f = fixture();
  try {
    f.store.enableObservation("project");
    await f.observer.poll();
    await f.observer.poll();
    assert.equal(f.count(), 1);
    await f.observer.stop();
    const next = new RepositoryObserver(f.store, f.data);
    await next.poll();
    await next.stop();
    assert.equal(f.count(), 1);
    const reopened = new Store(join(f.data, "traceframe.sqlite"));
    const restarted = new RepositoryObserver(reopened, f.data);
    try {
      await restarted.poll();
      assert.equal(reopened.usage("project").snapshots, 1);
    } finally {
      await restarted.stop();
      reopened.close();
    }
  } finally {
    await f.close();
  }
});

test("pause and deletion stop background capture and never revive a removed project", async () => {
  const f = fixture();
  try {
    f.store.enableObservation("project");
    await f.observer.poll();
    f.store.updateSettings("project", { paused: true });
    writeFileSync(join(f.root, "example.ts"), "export const value = 3;\n");
    await f.observer.poll();
    assert.equal(f.count(), 1);
    assert.equal(f.store.observation("project").status, "paused");
    f.store.updateSettings("project", { paused: false });
    await f.observer.poll();
    assert.equal(f.count(), 2);
    const pending = f.observer.poll();
    f.store.purgeProject("project");
    await pending;
    await f.observer.poll();
    assert.equal(f.count(), 0);
    assert.equal(f.store.project("project"), undefined);
    assert.equal(f.store.observationProjects().length, 0);
    assert.match(readFileSync(join(f.root, "example.ts"), "utf8"), /value = 3/);
  } finally {
    await f.close();
  }
});

test("metadata-only and redacted observation never persist disabled or secret code", async () => {
  const f = fixture(false);
  try {
    f.store.enableObservation("project");
    await f.observer.poll();
    writeFileSync(
      join(f.root, "example.ts"),
      'export const token = "ghp_SyntheticSecret1234567890";\n',
    );
    writeFileSync(join(f.root, "untracked.txt"), "synthetic private untracked");
    await f.observer.poll();
    assert.ok(
      f.store.latestObservedSnapshot("project")?.files.every((file) => file.content.text === null),
    );
    f.store.updateSettings("project", { policy: { code: true } });
    await f.observer.poll();
    const stored = JSON.stringify(f.store.latestObservedSnapshot("project"));
    assert.ok(!stored.includes("ghp_SyntheticSecret1234567890"));
    assert.match(stored, /REDACTED/);
    assert.ok(!stored.includes("synthetic private untracked"));
    f.store.updateSettings("project", { policy: { excludedPaths: ["example.ts"] } });
    await f.observer.poll();
    assert.equal(f.store.latestObservedSnapshot("project")?.files[0].content.text, null);
  } finally {
    await f.close();
  }
});

test("changed policy during capture discards the old sample; quota failures are explicit", async () => {
  const f = fixture();
  try {
    f.store.enableObservation("project");
    const pending = f.observer.poll();
    f.store.updateSettings("project", { policy: { code: false } });
    await pending;
    assert.equal(f.count(), 0);
    await f.observer.poll();
    assert.equal(f.count(), 1);
  } finally {
    await f.close();
  }
  const small = fixture(true, 1024);
  try {
    small.store.enableObservation("project");
    await small.observer.poll();
    assert.equal(small.count(), 0);
    assert.equal(small.store.usage("project").events, 0);
    assert.equal(small.store.observation("project").status, "blocked");
  } finally {
    await small.close();
  }
});

test("storage overlap and missing roots fail closed with content-free observer status", async () => {
  const f = fixture();
  try {
    f.store.enableObservation("project");
    const unsafe = new RepositoryObserver(f.store, f.root);
    await unsafe.poll();
    await unsafe.stop();
    assert.equal(f.count(), 0);
    assert.equal(f.store.observation("project").status, "unavailable");
    rmSync(f.root, { recursive: true, force: true });
    await f.observer.poll();
    assert.equal(f.count(), 0);
    assert.ok(!JSON.stringify(f.store.observation("project")).includes(f.root));
  } finally {
    await f.close();
  }
});

test("commit sampling is capped, detached HEAD stays explicit and retention is applied", async () => {
  const f = fixture();
  try {
    f.store.enableObservation("project");
    await f.observer.poll();
    const tree = f.git("rev-parse", "HEAD^{tree}");
    let parent = f.git("rev-parse", "HEAD");
    for (let i = 0; i < 105; i++)
      parent = f.git("commit-tree", tree, "-p", parent, "-m", `Synthetic commit ${i}`);
    f.git("update-ref", "HEAD", parent);
    await f.observer.poll();
    const state = f.state();
    if (state?.kind !== "repository_state") throw new Error("State missing");
    assert.equal(state.commits.length, 100);
    assert.equal(state.omitted, true);
    f.git("switch", "--quiet", "--detach", parent);
    await f.observer.poll();
    const detached = f.state();
    if (detached?.kind !== "repository_state") throw new Error("State missing");
    assert.equal(detached.branch, null);
    assert.deepEqual(detached.commits, []);
    f.store.updateSettings("project", { retentionDays: 0 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await f.observer.poll();
    await new Promise((resolve) => setTimeout(resolve, 5));
    f.store.applyRetention("project");
    assert.equal(f.count(), 0);
    assert.equal(f.store.usage("project").events, 0);
  } finally {
    await f.close();
  }
});

test("a stale observer epoch cannot write after deletion and re-registration", async () => {
  const f = fixture();
  try {
    const epoch = f.store.lifecycle("project").epoch;
    const sample = await captureRepository(f.root, { ...defaultPolicy, code: true });
    f.store.purgeProject("project");
    f.store.registerLocalRepository(
      "project",
      "Reconnected fixture",
      f.root,
      { ...defaultPolicy, code: true },
      false,
    );
    assert.throws(
      () => f.store.appendSnapshot("project", "history", sample, "baseline", [], epoch),
      /consent changed/,
    );
    assert.equal(f.count(), 0);
    assert.equal(f.store.usage("project").events, 0);
  } finally {
    await f.close();
  }
});
