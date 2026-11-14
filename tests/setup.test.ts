import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { connect, installedAgents } from "../server/connect.ts";
import { Store } from "../server/db.ts";
import { parseGithubRemote } from "../server/github.ts";
import { ingest } from "../server/ingest.ts";
import { defaultPrices } from "../server/prices.ts";
import {
  recordEverything,
  recordOnly,
  records,
  startRecording,
  stopRecording,
} from "../server/scope.ts";
import { deriveSession } from "../server/sessions.ts";
import {
  detectedAgents,
  globalTarget,
  isSetUp,
  refreshSetup,
  setup,
  setupStatus,
  spoolFile,
} from "../server/setup.ts";
import { drainSpool } from "../server/spool.ts";

// Every test runs against a throwaway HOME: the real agent configuration is never touched.
function sandbox() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "quoli-setup-")));
  const saved = { ...process.env };
  process.env.HOME = root;
  process.env.USERPROFILE = root; // os.homedir() on Windows
  process.env.QUOLI_HOME = join(root, ".quoli");
  for (const k of [
    "APPDATA",
    "XDG_CONFIG_HOME",
    "CODEX_HOME",
    "PI_CODING_AGENT_DIR",
    "QUOLI_PORT",
  ]) {
    delete process.env[k];
  }
  return {
    root,
    done() {
      process.env = saved;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("setup installs Quoli for every agent at user level and remove restores the files", () => {
  const box = sandbox();
  try {
    const claude = globalTarget("claude-code").file;
    mkdirSync(join(box.root, ".claude"), { recursive: true });
    const theirs = {
      model: "opus",
      hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] },
    };
    writeFileSync(claude, JSON.stringify(theirs));
    mkdirSync(join(box.root, ".codex"));
    assert.deepEqual(detectedAgents(), ["claude-code", "codex"]);

    const results = setup(["claude-code", "codex", "opencode", "pi"], false, []);
    assert.ok(results.every((r) => !r.error));
    assert.equal(results[2].file, join(box.root, ".config", "opencode", "plugins", "quoli.js"));
    assert.equal(results[3].file, join(box.root, ".pi", "agent", "extensions", "quoli.ts"));

    const settings = JSON.parse(readFileSync(claude, "utf8"));
    assert.equal(settings.model, "opus");
    assert.equal(settings.hooks.Stop.length, 2);
    assert.match(settings.hooks.PreToolUse[0].hooks[0].command, /quoli-hook\.mjs" 4400$/);
    const codex = JSON.parse(readFileSync(globalTarget("codex").file, "utf8"));
    assert.match(codex.hooks.PostModelRequest[0].hooks[0].command, /quoli-hook\.mjs" 4400 codex$/);
    assert.ok(existsSync(join(box.root, ".quoli", "quoli-hook.mjs")));
    const pi = readFileSync(globalTarget("pi").file, "utf8");
    assert.ok(pi.includes(`const SPOOL = "${spoolFile()}"`));
    assert.ok(setupStatus().every((s) => s.installed));

    setup(["claude-code", "codex", "opencode", "pi"], true);
    assert.deepEqual(JSON.parse(readFileSync(claude, "utf8")), theirs);
    assert.equal(existsSync(globalTarget("codex").file), false);
    assert.equal(existsSync(globalTarget("pi").file), false);
    assert.ok(setupStatus().every((s) => !s.installed));
  } finally {
    box.done();
  }
});

test("setup never overwrites a plugin it did not write, and reports it", () => {
  const box = sandbox();
  try {
    const file = globalTarget("opencode").file;
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, "export default {}\n");
    const [r] = setup(["opencode"], false, []);
    assert.match(r.error ?? "", /not Quoli's plugin/);
    assert.equal(readFileSync(file, "utf8"), "export default {}\n");
  } finally {
    box.done();
  }
});

test("setup takes Quoli's per-repository hooks out so nothing is recorded twice", () => {
  const box = sandbox();
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "quoli-setup-repo-")));
  try {
    execFileSync("git", ["init", "-q", repo]);
    connect(repo, false, "claude-code");
    connect(repo, false, "pi");
    assert.deepEqual(installedAgents(repo), ["claude-code", "pi"]);
    setup(["claude-code"], false, [repo]);
    assert.deepEqual(installedAgents(repo), ["pi"]);
  } finally {
    box.done();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("refreshSetup rewrites the install when the port changes and leaves other agents alone", () => {
  const box = sandbox();
  try {
    setup(["claude-code", "pi"], false, []);
    assert.deepEqual(refreshSetup(), []);
    process.env.QUOLI_PORT = "4555";
    assert.deepEqual(refreshSetup(), ["claude-code", "pi"]);
    assert.match(readFileSync(globalTarget("claude-code").file, "utf8"), /4555/);
    assert.match(readFileSync(globalTarget("pi").file, "utf8"), /Number\("4555"\)/);
    assert.equal(isSetUp("codex"), false);
    assert.deepEqual(refreshSetup(), []);

    // A second Quoli with its own home and port (a test, a demo) never takes the install over.
    const before = readFileSync(globalTarget("claude-code").file, "utf8");
    const pi = readFileSync(globalTarget("pi").file, "utf8");
    process.env.QUOLI_HOME = join(box.root, "elsewhere");
    process.env.QUOLI_PORT = "4721";
    assert.deepEqual(refreshSetup(), []);
    assert.equal(readFileSync(globalTarget("claude-code").file, "utf8"), before);
    assert.equal(readFileSync(globalTarget("pi").file, "utf8"), pi);
  } finally {
    box.done();
  }
});

test("the hook queues events while Quoli is closed and the server records them in order", () => {
  const box = sandbox();
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "quoli-spool-repo-")));
  try {
    execFileSync("git", ["init", "-q", repo]);
    setup(["claude-code", "codex"], false, []);
    // A sync that just ran keeps the hook from starting another one, which would drain the queue
    // while this test reads it (starting the sync is tested in background.test.ts).
    writeFileSync(join(box.root, ".quoli", "sync.last"), "");
    const run = (payload: object, agent?: string) =>
      execFileSync(
        process.execPath,
        [join(box.root, ".quoli", "quoli-hook.mjs"), "1", ...(agent ? [agent] : [])],
        { input: JSON.stringify(payload) },
      );
    const base = { session_id: "s-off", cwd: repo };
    assert.equal(
      run({ ...base, hook_event_name: "SessionStart", source: "startup" }).toString(),
      "",
    );
    run({ ...base, hook_event_name: "UserPromptSubmit", prompt: "Recorded while closed" });
    run({
      ...base,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_use_id: "t1",
    });
    run({ session_id: "c-off", cwd: repo, hook_event_name: "SessionStart" }, "codex");
    const lines = readFileSync(spoolFile(), "utf8").trim().split("\n");
    assert.equal(lines.length, 4);
    assert.equal(JSON.parse(lines[3]).agent, "codex");
    writeFileSync(spoolFile(), `${readFileSync(spoolFile(), "utf8")}not json\n`);

    const store = new Store(":memory:");
    assert.equal(drainSpool(store, spoolFile()), 4);
    assert.equal(existsSync(spoolFile()), false);
    assert.equal(drainSpool(store, spoolFile()), 0);
    const d = deriveSession(store.events("s-off"), [], defaultPrices());
    assert.equal(d?.title, "Recorded while closed");
    assert.deepEqual(
      store.events("s-off").map((e) => e.event),
      ["SessionStart", "UserPromptSubmit", "PreToolUse"],
    );
    assert.equal(deriveSession(store.events("c-off"), [], defaultPrices())?.agent, "codex");
  } finally {
    box.done();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("GitHub remotes are read in every common form", () => {
  for (const url of [
    "https://github.com/ICEQ-JO/quoli.git",
    "https://github.com/ICEQ-JO/quoli",
    "https://token@github.com/ICEQ-JO/quoli.git",
    "git@github.com:ICEQ-JO/quoli.git",
    "ssh://git@github.com/ICEQ-JO/quoli.git",
  ]) {
    assert.equal(parseGithubRemote(url), "ICEQ-JO/quoli", url);
  }
  assert.equal(parseGithubRemote("https://gitlab.com/a/b.git"), null);
  assert.equal(parseGithubRemote("https://github.com.evil.dev/a/b"), null);
  assert.equal(parseGithubRemote("git@github.com:a/b/c.git"), null);
});

test("only the chosen projects are recorded, by the hook and by the server", () => {
  const box = sandbox();
  const mine = realpathSync(mkdtempSync(join(tmpdir(), "quoli-scope-mine-")));
  const other = realpathSync(mkdtempSync(join(tmpdir(), "quoli-scope-other-")));
  try {
    for (const r of [mine, other]) execFileSync("git", ["init", "-q", r]);
    setup(["claude-code"], false, []);
    writeFileSync(join(box.root, ".quoli", "sync.last"), "");
    recordOnly(mine);
    assert.equal(records(join(mine, "src")), true);
    assert.equal(records(join(mine, ".claude", "worktrees", "a")), true);
    assert.equal(records(other), false);
    assert.equal(records(`${mine}-sibling`), false);

    const hook = (cwd: string, id: string) =>
      execFileSync(process.execPath, [join(box.root, ".quoli", "quoli-hook.mjs"), "1"], {
        input: JSON.stringify({ session_id: id, cwd, hook_event_name: "SessionStart" }),
      });
    hook(mine, "s-mine");
    hook(other, "s-other");
    const queued = readFileSync(spoolFile(), "utf8").trim().split("\n");
    assert.equal(queued.length, 1, "the hook drops events from projects that are not recorded");

    const store = new Store(":memory:");
    assert.ok(ingest(store, { session_id: "x", cwd: mine, hook_event_name: "SessionStart" }));
    assert.equal(
      ingest(store, { session_id: "y", cwd: other, hook_event_name: "SessionStart" }),
      false,
    );

    stopRecording(mine);
    assert.equal(records(mine), false);
    recordEverything();
    stopRecording(other);
    assert.equal(records(mine), true);
    assert.equal(records(other), false);
    startRecording(other);
    assert.equal(records(other), true);
    assert.equal(existsSync(join(box.root, ".quoli", "scope.json")), false);
  } finally {
    box.done();
    for (const r of [mine, other]) rmSync(r, { recursive: true, force: true });
  }
});
