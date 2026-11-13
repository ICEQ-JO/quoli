import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Store } from "../server/db.ts";
import { ingest } from "../server/ingest.ts";
import { defaultPrices } from "../server/prices.ts";
import { deriveSession } from "../server/sessions.ts";
import type { AgentKind } from "../shared/model.ts";

// Each agent's turn end, in its own wire shape (Claude Code and Codex: Stop with
// last_assistant_message; OpenCode and Pi: what Quoli's plugin and extension send).
const AGENTS: [AgentKind, (s: string, cwd: string) => Record<string, unknown>[]][] = [
  [
    "claude-code",
    (s, cwd) => [
      { session_id: s, cwd, hook_event_name: "UserPromptSubmit", prompt: "Fix it" },
      {
        session_id: s,
        cwd,
        hook_event_name: "SubagentStop",
        agent_id: "a1",
        last_assistant_message: "sub",
      },
      { session_id: s, cwd, hook_event_name: "Stop", last_assistant_message: "  Fixed it.\n" },
    ],
  ],
  [
    "codex",
    (s, cwd) => [
      { session_id: s, cwd, hook_event_name: "UserPromptSubmit", prompt: "Fix it" },
      { session_id: s, cwd, hook_event_name: "Stop", last_assistant_message: "Fixed it." },
    ],
  ],
  [
    "opencode",
    (s, cwd) => [
      { sessionID: s, cwd, opencode_event: "session.start" },
      { sessionID: s, cwd, opencode_event: "prompt", text: "Fix it" },
      { sessionID: s, cwd, opencode_event: "turn.ended", outcome: "succeeded", text: "Fixed it." },
    ],
  ],
  [
    "pi",
    (s, cwd) => [
      { sessionID: s, cwd, pi_event: "session.start", reason: "startup" },
      { sessionID: s, cwd, pi_event: "prompt", text: "Fix it" },
      { sessionID: s, cwd, pi_event: "agent.end", text: "Fixed it." },
    ],
  ],
];

test("every agent's final reply is kept on its turn; subagent replies and empty ones are not", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "quoli-replies-")));
  try {
    execFileSync("git", ["init", "-q", dir]);
    const store = new Store(":memory:");
    let n = 0;
    for (const [agent, events] of AGENTS) {
      const id = `s-${agent}`;
      for (const e of events(id, dir)) {
        const at = new Date(Date.UTC(2026, 10, 13, 10, 0, n++)).toISOString();
        assert.ok(ingest(store, e, at, undefined, agent), `${agent} accepted`);
      }
      const d = deriveSession(store.events(id), store.usage(id), defaultPrices());
      assert.ok(d);
      assert.equal(d.turns.length, 1, agent);
      assert.equal(d.turns[0].reply, "Fixed it.", agent);
    }
    // A turn that ended without text keeps no reply.
    for (const e of [
      { sessionID: "quiet", cwd: dir, opencode_event: "session.start" },
      { sessionID: "quiet", cwd: dir, opencode_event: "prompt", text: "Go" },
      { sessionID: "quiet", cwd: dir, opencode_event: "turn.ended", outcome: "failed", text: null },
    ]) {
      ingest(
        store,
        e,
        new Date(Date.UTC(2026, 10, 13, 11, 0, n++)).toISOString(),
        undefined,
        "opencode",
      );
    }
    const quiet = deriveSession(store.events("quiet"), store.usage("quiet"), defaultPrices());
    assert.ok(quiet);
    assert.equal(quiet.turns[0].reply, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("redaction applies to replies like prompts", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "quoli-replies-")));
  try {
    execFileSync("git", ["init", "-q", dir]);
    const store = new Store(":memory:");
    const key = `sk-ant-api03-${"x".repeat(40)}`;
    ingest(store, { session_id: "r", cwd: dir, hook_event_name: "UserPromptSubmit", prompt: "go" });
    ingest(store, {
      session_id: "r",
      cwd: dir,
      hook_event_name: "Stop",
      last_assistant_message: `Use ${key}`,
    });
    const d = deriveSession(store.events("r"), store.usage("r"), defaultPrices());
    assert.ok(d);
    assert.ok(d.turns[0].reply && !d.turns[0].reply.includes(key));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
