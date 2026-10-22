import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const parent = mkdtempSync(join(tmpdir(), "traceframe-setup-"));
const root = join(parent, "project");
const data = join(parent, "data");
const cli = (...args: string[]) =>
  execFileSync(process.execPath, ["--import", "tsx", "scripts/setup.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, TRACEFRAME_DATA_DIR: data },
    encoding: "utf8",
    timeout: 30000,
  });

test("the guided setup registers the project, adds only its own hooks and can undo them", () => {
  try {
    mkdirSync(join(root, ".claude"), { recursive: true });
    execFileSync("git", ["init", "--quiet", root]);
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        permissions: { allow: ["Bash(ls)"] },
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo existing" }] }],
        },
      }),
    );
    const installed = cli(root, "--name", "Setup example", "--capture-code", "--agent", "claude");
    assert.match(installed, /Registered the project as repo_[a-f0-9]{32}/);
    assert.match(installed, /Existing hook groups left untouched: 1/);
    const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
    assert.deepEqual(settings.permissions, { allow: ["Bash(ls)"] });
    assert.equal(settings.hooks.PreToolUse.length, 2);
    const check = cli(root, "--check");
    assert.match(check, /Hooks: installed/);
    assert.match(check, /Repository: registered/);
    const projectId = installed.match(/repo_[a-f0-9]{32}/)?.[0];
    assert.ok(projectId);
    const undone = cli(root, "--undo", projectId);
    assert.match(undone, /Removed 6 hook events/);
    const after = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
    assert.equal(after.hooks.PreToolUse.length, 1);
    assert.equal(after.hooks.PreToolUse[0].hooks[0].command, "echo existing");
    assert.deepEqual(after.permissions, { allow: ["Bash(ls)"] });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("the setup reports a missing project directory instead of failing silently", () => {
  assert.throws(
    () => cli(join(parent, "missing")),
    (error: unknown) => {
      const output = String((error as { stderr?: string }).stderr ?? "");
      return output.includes("Setup could not finish");
    },
  );
  assert.equal(existsSync(join(parent, "missing")), false);
});

test("repository-only connect is idempotent, opts into observation and does not install agent hooks", () => {
  const parent = mkdtempSync(join(tmpdir(), "quoli-connect-"));
  const root = join(parent, "repo"),
    data = join(parent, "data");
  const connect = (...args: string[]) =>
    execFileSync(process.execPath, ["--import", "tsx", "scripts/setup.ts", ...args], {
      env: { ...process.env, TRACEFRAME_DATA_DIR: data },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    execFileSync("git", ["init", "--quiet", root]);
    const first = connect(root);
    assert.match(first, /Automatic repository history is enabled/);
    assert.match(first, /No agent hooks installed/);
    assert.equal(existsSync(join(root, ".claude")), false);
    const second = connect(root);
    assert.match(second, /already registered/);
    assert.equal(first.match(/repo_[a-f0-9]{32}/)?.[0], second.match(/repo_[a-f0-9]{32}/)?.[0]);
    assert.match(connect(root, "--check"), /Automatic repository history: waiting/);
    assert.throws(() => connect(root, "--agent", "unknown"));
    assert.throws(() => connect(root, "--telemetry"));
    assert.throws(() => connect(root, "--undo", "wrong-project"));
    assert.equal(existsSync(join(root, ".claude")), false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
