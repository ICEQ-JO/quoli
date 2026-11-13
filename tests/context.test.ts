import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { missingEvents, TARGETS } from "../server/connect.ts";
import { contextOf } from "../server/context.ts";
import type { RawEvent } from "../server/db.ts";
import type { UsagePoint } from "../shared/model.ts";

const T0 = Date.parse("2026-11-13T10:00:00Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const ev = (s: number, event: string, payload: Record<string, unknown> = {}): RawEvent =>
  ({ seq: s, sessionId: "s", root: "/repo", event, at: at(s), payload }) as unknown as RawEvent;
const use = (s: number, input: number, cacheRead: number, agentId = "main"): UsagePoint => ({
  at: at(s),
  agentId,
  model: "claude-opus-5-5",
  tokens: { input, output: 50, cacheRead, cacheWrite: 0 },
});

test("context: size over time, compactions with before and after, instruction files, commands", () => {
  const events = [
    ev(0, "SessionStart", { source: "startup" }),
    ev(1, "InstructionsLoaded", {
      file_path: "/repo/CLAUDE.md",
      memory_type: "Project",
      load_reason: "session_start",
    }),
    ev(2, "InstructionsLoaded", {
      file_path: "/home/me/.claude/CLAUDE.md",
      memory_type: "User",
      load_reason: "session_start",
    }),
    ev(3, "UserPromptExpansion", {
      expansion_type: "slash_command",
      command_name: "review",
      command_args: "#12",
      command_source: "plugin",
    }),
    ev(50, "PreCompact", { trigger: "auto" }),
    ev(55, "PostCompact", { trigger: "auto" }),
    ev(56, "InstructionsLoaded", { file_path: "/repo/CLAUDE.md", load_reason: "compact" }),
    ev(60, "PostModelSwitch", { from_model: "claude-opus-5-5", to_model: "claude-sonnet-5-5" }),
    // A subagent's own instruction load is not the main agent's context.
    ev(61, "InstructionsLoaded", { file_path: "/repo/sub.md", agent_id: "a1" }),
  ];
  const usage = [
    use(10, 1000, 20_000),
    use(40, 2000, 150_000),
    use(45, 500, 5000, "a1"),
    use(70, 1000, 30_000),
  ];
  const c = contextOf(events, usage, "/repo");
  assert.deepEqual(
    c.sizes.map((p) => p.tokens),
    [21_000, 152_000, 31_000],
    "main agent only: input + cache read + cache write",
  );
  assert.equal(c.peak, 152_000);
  assert.equal(c.current, 31_000);
  assert.deepEqual(c.compactions, [
    { at: at(50), trigger: "auto", before: 152_000, after: 31_000 },
  ]);
  assert.deepEqual(
    c.instructions.map((i) => [i.path, i.scope, i.reason, i.reloads]),
    [
      ["CLAUDE.md", "Project", "session_start", 1],
      ["/home/me/.claude/CLAUDE.md", "User", "session_start", 0],
    ],
  );
  assert.deepEqual(c.commands, [
    { at: at(3), name: "review", args: "#12", source: "plugin", kind: "slash_command" },
  ]);
  assert.deepEqual(c.modelSwitches, [
    { at: at(60), from: "claude-opus-5-5", to: "claude-sonnet-5-5" },
  ]);

  const none = contextOf([ev(0, "SessionStart")], [], "/repo");
  assert.equal(none.peak, null, "no usage: unknown, not zero");
  assert.deepEqual(none.sizes, []);
});

test("an install made before new events were added is detected as missing them", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-events-"));
  try {
    const file = join(dir, "settings.json");
    const ours = [{ hooks: [{ type: "command", command: "node /x/quoli-hook.mjs 4400" }] }];
    const old = Object.fromEntries(["SessionStart", "Stop"].map((e) => [e, ours]));
    writeFileSync(file, JSON.stringify({ hooks: old }));
    assert.equal(missingEvents(file, "claude-code"), true);
    const all = Object.fromEntries(TARGETS["claude-code"].events.map((e) => [e, ours]));
    writeFileSync(file, JSON.stringify({ hooks: all }));
    assert.equal(missingEvents(file, "claude-code"), false);
    writeFileSync(file, JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: "other" }] }] } }));
    assert.equal(
      missingEvents(file, "claude-code"),
      false,
      "never adds Quoli where it is not installed",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
