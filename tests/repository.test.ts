import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { captureRepository, type RepositorySnapshot } from "../packages/repository/src/index";
import { type CapturePolicy, defaultPolicy } from "../packages/schema/src/index";

const policy = (overrides: Partial<CapturePolicy> = {}): CapturePolicy => ({
  ...defaultPolicy,
  code: true,
  ...overrides,
});

type Repo = {
  dir: string;
  git: (...args: string[]) => string;
  write: (path: string, body: string | Buffer) => void;
  remove: (path: string) => void;
  read: (path: string) => Buffer;
};

function createRepo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-repository-"));
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: "pipe" });
  git("init", "-q", ".");
  git("config", "user.email", "151853839+ICEQ-JO@users.noreply.github.com");
  git("config", "user.name", "ICEQ-JO");
  git("config", "commit.gpgsign", "false");
  const write = (path: string, body: string | Buffer) => {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
  };
  return {
    dir,
    git,
    write,
    remove: (path) => rmSync(join(dir, path), { force: true, recursive: true }),
    read: (path) => readFileSync(join(dir, path)),
  };
}

const fileOf = (snapshot: RepositorySnapshot, path: string) => {
  const file = snapshot.files.find((entry) => entry.path === path);
  assert.ok(file, `expected ${path} in the snapshot`);
  return file;
};

test("captures staged, unstaged and opted-in untracked working tree state", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");
  repo.write("staged.txt", "staged\n");
  repo.git("add", "staged.txt");
  repo.write("tracked.txt", "modified in the work tree\n");
  repo.write("untracked.txt", "untracked\n");

  const snapshot = await captureRepository(repo.dir, policy(), { includeUntracked: true });
  assert.equal(snapshot.state, "observed");
  assert.equal(snapshot.dirty, true);
  assert.match(snapshot.head ?? "", /^[0-9a-f]{40}$/);
  assert.match(snapshot.indexIdentity ?? "", /^[0-9a-f]{64}$/);
  assert.match(snapshot.id, /^snap_[0-9a-f-]{36}$/);

  const tracked = fileOf(snapshot, "tracked.txt");
  assert.equal(tracked.tracked, true);
  assert.equal(tracked.staged, false);
  assert.equal(tracked.status, "present");
  assert.equal(tracked.content.text, "modified in the work tree\n");
  assert.ok(tracked.fingerprint);

  const staged = fileOf(snapshot, "staged.txt");
  assert.equal(staged.tracked, true);
  assert.equal(staged.staged, true);
  assert.equal(staged.content.text, "staged\n");

  const untracked = fileOf(snapshot, "untracked.txt");
  assert.equal(untracked.tracked, false);
  assert.equal(untracked.staged, false);
  assert.equal(untracked.content.text, "untracked\n");
});

test("keeps untracked files out of the snapshot unless they are requested", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");
  repo.write("untracked.txt", "untracked\n");

  const snapshot = await captureRepository(repo.dir, policy());
  assert.equal(
    snapshot.files.some((entry) => entry.path === "untracked.txt"),
    false,
  );
  assert.ok(snapshot.warnings.some((warning) => warning.includes("Untracked")));
});

test("metadata policy never captures file bodies", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");

  const snapshot = await captureRepository(repo.dir, policy({ code: false }));
  const tracked = fileOf(snapshot, "tracked.txt");
  assert.equal(tracked.content.text, null);
  assert.equal(tracked.content.state, "disabled");
  assert.equal(tracked.content.categories.join(), "code");
  assert.equal(tracked.fingerprint, null);
  assert.equal(snapshot.dirty, null);
  assert.ok(snapshot.warnings.some((warning) => warning.includes("content capture is disabled")));
});

test("redacts secret-like content before it leaves the module", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  // Synthetic canary, assembled at runtime so no credential shape is committed.
  const canary = ["sk", "-", "TRACEFRAME", "CANARY", "0123456789abcdef"].join("");
  repo.write("tracked.txt", `const token = "${canary}";\n`);
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");

  const snapshot = await captureRepository(repo.dir, policy());
  const tracked = fileOf(snapshot, "tracked.txt");
  assert.equal(tracked.content.state, "redacted");
  assert.equal(tracked.content.text?.includes(canary), false);
  assert.ok(tracked.content.text?.includes("[REDACTED]"));
  assert.equal(JSON.stringify(snapshot).includes(canary), false);
});

test("never follows a symlink out of the root, including through a directory", async (t) => {
  const repo = createRepo();
  const outside = mkdtempSync(join(tmpdir(), "traceframe-outside-"));
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const canary = ["outside", "canary", "0123456789"].join("-");
  writeFileSync(join(outside, "secret.txt"), canary);

  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");
  symlinkSync(join(outside, "secret.txt"), join(repo.dir, "link.txt"));
  symlinkSync(outside, join(repo.dir, "linked-dir"));
  repo.git("add", "link.txt");

  const snapshot = await captureRepository(repo.dir, policy(), { includeUntracked: true });
  assert.equal(JSON.stringify(snapshot).includes(canary), false);
  const link = fileOf(snapshot, "link.txt");
  assert.equal(link.status, "symlink");
  assert.equal(link.content.text, null);
  const throughDirectory = snapshot.files.find((entry) => entry.path.startsWith("linked-dir"));
  assert.ok(throughDirectory);
  assert.equal(throughDirectory.content.text, null);
  assert.notEqual(throughDirectory.status, "present");
});

test("marks binary, oversized and deleted paths explicitly", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  repo.write("binary.bin", Buffer.from([0x61, 0x00, 0x62]));
  repo.write("invalid.txt", Buffer.from([0x61, 0xff, 0x62]));
  repo.write("large.txt", "x".repeat(4096));
  repo.write("removed.txt", "gone later\n");
  repo.git("add", ".");
  repo.git("commit", "-qm", "init");
  repo.remove("removed.txt");

  const snapshot = await captureRepository(repo.dir, policy(), { maxFileBytes: 1024 });
  const binary = fileOf(snapshot, "binary.bin");
  assert.equal(binary.status, "binary");
  assert.equal(binary.content.text, null);
  assert.equal(binary.content.state, "unsupported");
  const invalid = fileOf(snapshot, "invalid.txt");
  assert.equal(invalid.status, "binary");
  assert.equal(invalid.content.text, null);
  assert.equal(invalid.content.state, "malformed");
  const large = fileOf(snapshot, "large.txt");
  assert.equal(large.status, "oversized");
  assert.equal(large.content.text, null);
  assert.equal(large.content.state, "unavailable");
  const removed = fileOf(snapshot, "removed.txt");
  assert.equal(removed.status, "deleted");
  assert.equal(removed.content.text, null);
  assert.equal(snapshot.dirty, true);
});

test("records a submodule without traversing it", async (t) => {
  const repo = createRepo();
  const sub = mkdtempSync(join(tmpdir(), "traceframe-submodule-"));
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  t.after(() => rmSync(sub, { recursive: true, force: true }));
  const subGit = (...args: string[]) => execFileSync("git", args, { cwd: sub, stdio: "pipe" });
  subGit("init", "-q", ".");
  subGit("config", "user.email", "151853839+ICEQ-JO@users.noreply.github.com");
  subGit("config", "user.name", "ICEQ-JO");
  writeFileSync(join(sub, "inside.txt"), "submodule content\n");
  subGit("add", "inside.txt");
  subGit("commit", "-qm", "submodule");
  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");
  repo.git("-c", "protocol.file.allow=always", "submodule", "add", "-q", sub, "nested");

  const snapshot = await captureRepository(repo.dir, policy());
  const nested = fileOf(snapshot, "nested");
  assert.equal(nested.status, "submodule");
  assert.equal(nested.content.text, null);
  assert.equal(
    snapshot.files.some((entry) => entry.path.startsWith("nested/")),
    false,
  );
});

test("marks a snapshot racy when the repository moves during the capture", async (t) => {
  const repo = createRepo();
  const wrapperDir = mkdtempSync(join(tmpdir(), "traceframe-git-"));
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  t.after(() => rmSync(wrapperDir, { recursive: true, force: true }));
  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");

  const real = execFileSync("sh", ["-c", "command -v git"]).toString().trim();
  const wrapper = join(wrapperDir, "git");
  writeFileSync(
    wrapper,
    `#!/bin/sh
case "$*" in
  *ls-files*--stage*)
    "${real}" "$@"
    status=$?
    "${real}" commit -q --allow-empty -m concurrent
    exit $status
    ;;
esac
exec "${real}" "$@"
`,
  );
  chmodSync(wrapper, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${wrapperDir}:${previousPath ?? ""}`;
  t.after(() => {
    process.env.PATH = previousPath;
  });

  const snapshot = await captureRepository(repo.dir, policy());
  assert.equal(snapshot.state, "racy");
  assert.ok(snapshot.warnings.some((warning) => warning.includes("changed during capture")));
});

test("excludes ignored and policy excluded paths and never reads them", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  const canary = ["excluded", "canary", "0123456789"].join("-");
  repo.write(".gitignore", "ignored.txt\n");
  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt", ".gitignore");
  repo.git("commit", "-qm", "init");
  repo.write("ignored.txt", "ignored\n");
  repo.write("secret.txt", canary);
  chmodSync(join(repo.dir, "secret.txt"), 0o000);

  const snapshot = await captureRepository(repo.dir, policy({ excludedPaths: ["secret.txt"] }), {
    includeUntracked: true,
  });
  assert.equal(
    snapshot.files.some((entry) => entry.path === "ignored.txt"),
    false,
  );
  const secret = fileOf(snapshot, "secret.txt");
  assert.equal(secret.status, "excluded");
  assert.equal(secret.content.text, null);
  assert.equal(JSON.stringify(snapshot).includes(canary), false);
  chmodSync(join(repo.dir, "secret.txt"), 0o600);
});

test("records an unborn HEAD and a moved HEAD", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  repo.write("first.txt", "one\n");
  repo.git("add", "first.txt");

  const unborn = await captureRepository(repo.dir, policy());
  assert.equal(unborn.head, null);
  assert.match(unborn.indexIdentity ?? "", /^[0-9a-f]{64}$/);
  assert.equal(fileOf(unborn, "first.txt").staged, true);

  repo.git("commit", "-qm", "init");
  const first = await captureRepository(repo.dir, policy());
  repo.write("second.txt", "two\n");
  repo.git("add", "second.txt");
  repo.git("commit", "-qm", "second");
  const second = await captureRepository(repo.dir, policy());
  assert.notEqual(first.head, second.head);
  assert.ok(first.head && second.head);
});

test("handles hostile file names", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  const names = [
    "café ☕.txt",
    "line\nbreak.txt",
    "-leading-dash.txt",
    'quote"name.txt',
    "emoji 😀.txt",
    "tab\tname.txt",
  ];
  for (const name of names) repo.write(name, `content of ${name}\n`);
  repo.git("add", ".");
  repo.git("commit", "-qm", "init");

  const snapshot = await captureRepository(repo.dir, policy());
  const captured = snapshot.files.map((entry) => entry.path);
  for (const name of names) assert.ok(captured.includes(name), `expected ${JSON.stringify(name)}`);
});

test("does not invent a path for a file name that is not valid UTF-8", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  const name = Buffer.concat([Buffer.from("invalid"), Buffer.from([0xff]), Buffer.from(".txt")]);
  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");
  writeFileSync(Buffer.concat([Buffer.from(`${repo.dir}/`), name]), "content\n");
  repo.git("add", ".");

  const snapshot = await captureRepository(repo.dir, policy());
  assert.equal(snapshot.omitted, 1);
  assert.ok(snapshot.warnings.some((warning) => warning.includes("not valid UTF-8")));
  assert.equal(
    snapshot.files.some((entry) => entry.status === "deleted"),
    false,
  );
});

test("does not execute a configured clean filter", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  const marker = join(repo.dir, "filter-ran");
  const script = join(repo.dir, "filter.sh");
  writeFileSync(script, `#!/bin/sh\ntouch "${marker}"\ncat\n`);
  chmodSync(script, 0o755);
  repo.git("config", "filter.evil.clean", script);
  repo.write(".gitattributes", "tracked.txt filter=evil\n");
  repo.write("tracked.txt", "committed\n");
  repo.git("add", ".");
  repo.git("commit", "-qm", "init");
  repo.write("tracked.txt", "modified\n");
  rmSync(marker, { force: true });

  const snapshot = await captureRepository(repo.dir, policy());
  assert.equal(existsSync(marker), false);
  assert.ok(snapshot.warnings.some((warning) => warning.includes("conversion is never executed")));
});

test("does not execute a configured fsmonitor hook or a Git hook", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  const marker = join(repo.dir, "hook-ran");
  const script = join(repo.dir, "hook.sh");
  writeFileSync(script, `#!/bin/sh\ntouch "${marker}"\n`);
  chmodSync(script, 0o755);
  const hooks = join(repo.dir, "hooks");
  mkdirSync(hooks);
  writeFileSync(join(hooks, "post-index-change"), `#!/bin/sh\ntouch "${marker}"\n`);
  chmodSync(join(hooks, "post-index-change"), 0o755);

  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");
  repo.git("config", "core.fsmonitor", script);
  repo.git("config", "core.hooksPath", hooks);

  await captureRepository(repo.dir, policy());
  assert.equal(existsSync(marker), false);
});

test("leaves the index and the working tree unchanged", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");
  repo.write("tracked.txt", "modified\n");
  const indexPath = join(repo.dir, ".git", "index");
  const before = readFileSync(indexPath);
  const statusBefore = repo.git("status", "--porcelain");

  await captureRepository(repo.dir, policy(), { includeUntracked: true });

  assert.deepEqual(readFileSync(indexPath), before);
  assert.equal(repo.git("status", "--porcelain"), statusBefore);
  assert.deepEqual(readdirSync(repo.dir).sort(), [".git", "tracked.txt"]);
});

test("enforces the file, per file byte and total byte limits", async (t) => {
  const repo = createRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  for (const name of ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"])
    repo.write(name, "x".repeat(100));
  repo.git("add", ".");
  repo.git("commit", "-qm", "init");

  const limited = await captureRepository(repo.dir, policy(), { maxFiles: 2 });
  assert.equal(limited.files.length, 2);
  assert.equal(limited.omitted, 3);
  assert.ok(limited.warnings.some((warning) => warning.includes("file limit")));

  const perFile = await captureRepository(repo.dir, policy(), { maxFileBytes: 16 });
  assert.equal(fileOf(perFile, "a.txt").status, "oversized");

  const total = await captureRepository(repo.dir, policy(), { maxTotalBytes: 150 });
  const captured = total.files.filter((entry) => entry.content.text !== null);
  assert.equal(captured.length, 1);
  assert.equal(total.files.filter((entry) => entry.status === "unavailable").length, 4);
  assert.ok(total.warnings.some((warning) => warning.includes("byte budget")));

  await assert.rejects(() => captureRepository(repo.dir, policy(), { maxFiles: 0 }));
  await assert.rejects(() => captureRepository(repo.dir, policy(), { maxFiles: 5000 }));
  await assert.rejects(() =>
    captureRepository(repo.dir, policy(), { maxFileBytes: 2 * 1024 * 1024 }),
  );
  await assert.rejects(() =>
    captureRepository(repo.dir, policy(), { maxTotalBytes: 64 * 1024 * 1024 }),
  );
});

test("never returns the absolute root and captures a linked work tree", async (t) => {
  const repo = createRepo();
  const worktree = mkdtempSync(join(tmpdir(), "traceframe-worktree-"));
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  t.after(() => rmSync(worktree, { recursive: true, force: true }));
  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");
  repo.git("worktree", "add", "-q", join(worktree, "linked"), "HEAD");

  const snapshot = await captureRepository(join(worktree, "linked"), policy());
  assert.equal(JSON.stringify(snapshot).includes(repo.dir), false);
  assert.equal(JSON.stringify(snapshot).includes(worktree), false);
  assert.equal(fileOf(snapshot, "tracked.txt").content.text, "committed\n");
  assert.equal(snapshot.dirty, false);
});

test("a Git executable inside the observed repository is never run, and missing Git fails safely", async (t) => {
  const repo = createRepo();
  const wrappers = mkdtempSync(join(tmpdir(), "traceframe-git-path-"));
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  t.after(() => rmSync(wrappers, { recursive: true, force: true }));
  repo.write("tracked.txt", "committed\n");
  repo.git("add", "tracked.txt");
  repo.git("commit", "-qm", "init");
  const marker = join(repo.dir, "should-not-run");
  const command = join(repo.dir, "git");
  writeFileSync(command, `#!/bin/sh\ntouch "${marker}"\nexit 1\n`);
  chmodSync(command, 0o755);
  symlinkSync(command, join(wrappers, "git"));
  const previous = process.env.PATH;
  try {
    process.env.PATH = `${repo.dir}:${wrappers}:.:${previous ?? ""}`;
    const captured = await captureRepository(repo.dir, policy());
    assert.ok(captured.id);
    assert.equal(existsSync(marker), false);
    process.env.PATH = repo.dir;
    await assert.rejects(captureRepository(repo.dir, policy()), /Git executable unavailable/);
    assert.equal(existsSync(marker), false);
  } finally {
    process.env.PATH = previous;
  }
});
