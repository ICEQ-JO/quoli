import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { hooksInstalled, refreshHooks } from "../server/connect.ts";
import { Store } from "../server/db.ts";
import { syncTranscript } from "../server/transcript.ts";

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), "quoli-fix-")));

const assistant = (id: string, output: number) =>
  JSON.stringify({
    type: "assistant",
    timestamp: "2026-11-12T10:00:00.000Z",
    message: { id, model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: output } },
  });

test("a transcript line longer than one read block is skipped, not a permanent stall", () => {
  const dir = tmp();
  const store = new Store(":memory:");
  const file = join(dir, "t.jsonl");
  try {
    const huge = JSON.stringify({ type: "user", text: "x".repeat(500) });
    writeFileSync(file, `${assistant("m1", 5)}\n${huge}\n${assistant("m2", 7)}\n`);
    syncTranscript(store, file, "s1", "main", 200);
    assert.deepEqual(
      store.usage("s1").map((u) => [u.messageId, u.output]),
      [
        ["m1", 5],
        ["m2", 7],
      ],
    );
    assert.equal(store.transcriptOffset(file), readFileSync(file).length);

    // A partial last line waits for its newline; it is read once complete.
    writeFileSync(file, `${readFileSync(file, "utf8")}${assistant("m3", 9)}`);
    syncTranscript(store, file, "s1", "main", 200);
    assert.equal(store.usage("s1").length, 2);
    writeFileSync(file, `${readFileSync(file, "utf8")}\n`);
    syncTranscript(store, file, "s1", "main", 200);
    assert.equal(store.usage("s1").length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("startup refresh rewrites a stale Quoli hook and leaves everything else alone", () => {
  const stale = tmp();
  const untouched = tmp();
  try {
    const other = { type: "command", command: "echo mine" };
    const settings = {
      model: "keep-me",
      hooks: {
        PreToolUse: [
          { hooks: [other] },
          { hooks: [{ type: "command", command: '"node" "/old/quoli/server/hook.mjs" 9999' }] },
        ],
      },
    };
    mkdirSync(join(stale, ".claude"));
    writeFileSync(join(stale, ".claude", "settings.local.json"), JSON.stringify(settings));
    mkdirSync(join(untouched, ".claude"));
    const plain = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [other] }] } });
    writeFileSync(join(untouched, ".claude", "settings.local.json"), plain);

    assert.deepEqual(refreshHooks([stale, untouched, join(stale, "missing")]), [stale]);
    const after = JSON.parse(readFileSync(join(stale, ".claude", "settings.local.json"), "utf8"));
    assert.equal(after.model, "keep-me");
    assert.deepEqual(after.hooks.PreToolUse[0], { hooks: [other] });
    const ours = after.hooks.PreToolUse[1].hooks[0].command as string;
    assert.ok(!ours.includes("/old/quoli/") && !ours.endsWith(" 9999"));
    assert.ok(hooksInstalled(stale));
    assert.equal(readFileSync(join(untouched, ".claude", "settings.local.json"), "utf8"), plain);

    // Once current, it is not rewritten again.
    assert.deepEqual(refreshHooks([stale]), []);
  } finally {
    rmSync(stale, { recursive: true, force: true });
    rmSync(untouched, { recursive: true, force: true });
  }
});

test("commit attribution considers every session with commit output, not only the newest", () => {
  const store = new Store(":memory:");
  const root = "/repo";
  const at = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
  store.append({
    sessionId: "old",
    root,
    event: "PostToolUse",
    at: at(0),
    payload: { tool_input: { command: "git commit -m x" }, tool_response: "[main abc1234] x" },
  });
  for (let i = 1; i <= 250; i++) {
    store.append({ sessionId: `s${i}`, root, event: "PostToolUse", at: at(i), payload: {} });
  }
  assert.ok(!store.sessionIds(root).includes("old"));
  assert.deepEqual(store.commitSessionIds(root), ["old"]);
  assert.deepEqual(store.commitSessionIds("/elsewhere"), []);
});
