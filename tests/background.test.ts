import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runSync } from "../server/background.ts";
import { hook } from "../server/connect.ts";
import { Store } from "../server/db.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("with Quoli closed, the hook queues the event and starts sync once per 90 seconds", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-kick-"));
  try {
    const copy = join(dir, "quoli-hook.mjs");
    copyFileSync(hook, copy);
    // A stand-in for `quoli sync` that only leaves a mark.
    const mark = join(dir, "ran");
    writeFileSync(
      join(dir, "sync.json"),
      JSON.stringify({
        command: process.execPath,
        args: ["-e", `require("fs").appendFileSync(${JSON.stringify(mark)}, "x")`],
        cwd: dir,
      }),
    );
    const send = () =>
      execFileSync(process.execPath, [copy, "1"], {
        input: JSON.stringify({ hook_event_name: "Stop", session_id: "s" }),
      });
    send();
    send();
    for (let i = 0; i < 50 && !existsSync(mark); i++) await wait(50);
    await wait(200);
    assert.equal(readFileSync(join(dir, "spool.jsonl"), "utf8").trim().split("\n").length, 2);
    assert.equal(readFileSync(mark, "utf8"), "x", "started once, not twice");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("quoli sync records the queue while Quoli is closed, then exits and clears its stamp", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-sync-run-"));
  const before = { home: process.env.QUOLI_HOME, port: process.env.QUOLI_PORT };
  process.env.QUOLI_HOME = dir;
  process.env.QUOLI_PORT = "1";
  try {
    const at = "2026-11-12T10:00:00.000Z";
    const line = (p: object) =>
      JSON.stringify({
        agent: "claude-code",
        at,
        body: JSON.stringify({ session_id: "q1", cwd: dir, ...p }),
      });
    writeFileSync(
      join(dir, "spool.jsonl"),
      `${[line({ hook_event_name: "SessionStart" }), line({ hook_event_name: "UserPromptSubmit", prompt: "hello" })].join("\n")}\n`,
    );
    writeFileSync(join(dir, "sync.last"), "");
    assert.equal(await runSync({ quietMs: 10 }), 0);
    assert.ok(!existsSync(join(dir, "spool.jsonl")), "queue recorded and emptied");
    assert.ok(!existsSync(join(dir, "sync.last")), "the next event may start a new run at once");
    const store = new Store(join(dir, "quoli.db"));
    assert.equal(store.events("q1").length, 2);
    store.db.close();
  } finally {
    if (before.home === undefined) delete process.env.QUOLI_HOME;
    else process.env.QUOLI_HOME = before.home;
    if (before.port === undefined) delete process.env.QUOLI_PORT;
    else process.env.QUOLI_PORT = before.port;
    rmSync(dir, { recursive: true, force: true });
  }
});
