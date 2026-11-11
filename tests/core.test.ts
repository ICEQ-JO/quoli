import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resolveImports } from "../server/code.ts";
import { connect } from "../server/connect.ts";
import { type RawEvent, Store } from "../server/db.ts";
import { detectInfra } from "../server/infra.ts";
import { ingest, redact } from "../server/ingest.ts";
import { defaultPrices } from "../server/prices.ts";
import { deriveSession } from "../server/sessions.ts";
import { usageFromLines } from "../server/transcript.ts";

const root = "/repo";
let seq = 0;
const ev = (
  event: string,
  payload: Record<string, unknown>,
  at = `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
): RawEvent => ({
  seq: ++seq,
  sessionId: "s1",
  root,
  event,
  at,
  payload,
});

test("a session is derived from hook events: turns, calls, files, failures, subagents", () => {
  const events = [
    ev("SessionStart", { quoli_branch: "main" }),
    ev("UserPromptSubmit", { prompt: "Fix the bug\nmore detail" }),
    ev("PreToolUse", {
      tool_name: "Read",
      tool_use_id: "t1",
      tool_input: { file_path: "/repo/src/a.ts" },
    }),
    ev("PostToolUse", { tool_name: "Read", tool_use_id: "t1", tool_response: "ok" }),
    ev("PreToolUse", {
      tool_name: "Edit",
      tool_use_id: "t2",
      tool_input: { file_path: "/repo/src/a.ts", old_string: "a", new_string: "b" },
    }),
    ev("PostToolUse", { tool_name: "Edit", tool_use_id: "t2", tool_response: { success: true } }),
    ev("PreToolUse", { tool_name: "Bash", tool_use_id: "t3", tool_input: { command: "npm test" } }),
    ev("PostToolUseFailure", { tool_name: "Bash", tool_use_id: "t3", error: "1 failing" }),
    ev("PreToolUse", {
      tool_name: "Read",
      tool_use_id: "t4",
      agent_id: "sub1",
      agent_type: "Explore",
      tool_input: { file_path: "/elsewhere/x.ts" },
    }),
    ev("SessionEnd", {}),
  ];
  const usage = usageFromLines(
    [
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-01-01T00:00:03Z",
        message: {
          id: "m1",
          model: "claude-x",
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 0,
          },
        },
      }),
    ],
    "s1",
    "main",
  );
  const s = deriveSession(events, usage, defaultPrices(), Date.parse("2026-01-01T00:01:00Z"));
  assert.ok(s);
  assert.equal(s.title, "Fix the bug");
  assert.equal(s.branch, "main");
  assert.equal(s.toolCount, 4);
  assert.equal(s.failures, 1);
  assert.equal(s.live, false);
  assert.deepEqual(s.files["src/a.ts"], { read: 1, edited: 1, toolCallIds: ["t1", "t2"] });
  // Paths outside the repository are not attributed to it.
  assert.equal(Object.keys(s.files).length, 1);
  assert.equal(s.toolCalls.find((c) => c.id === "t3")?.output, "1 failing");
  assert.equal(s.agents.find((a) => a.id === "sub1")?.type, "Explore");
  assert.equal(s.tokens.input + s.tokens.output + s.tokens.cacheRead, 115);
  assert.equal(s.turns[0].toolCallIds.length, 4);
});

test("transcript usage is read once per message even when a message spans several lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-"));
  try {
    const store = new Store(":memory:");
    const line = (output: number) =>
      JSON.stringify({
        type: "assistant",
        message: { id: "msg_1", model: "m", usage: { input_tokens: 3, output_tokens: output } },
      });
    for (const row of usageFromLines(
      [line(1), line(40), "not json", JSON.stringify({ type: "user" })],
      "s",
      "main",
    )) {
      store.upsertUsage(row);
    }
    const rows = store.usage("s");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].output, 40);
    assert.equal(rows[0].input, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ingest reads token usage from the transcript the hook points at, incrementally", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-"));
  try {
    const store = new Store(":memory:");
    const transcript = join(dir, "t.jsonl");
    const msg = (id: string) =>
      `${JSON.stringify({ type: "assistant", message: { id, usage: { input_tokens: 5, output_tokens: 1 } } })}\n`;
    writeFileSync(transcript, msg("a"));
    const base = { session_id: "s", cwd: dir, transcript_path: transcript };
    ingest(store, { ...base, hook_event_name: "SessionStart" });
    writeFileSync(transcript, msg("a") + msg("b"));
    ingest(store, { ...base, hook_event_name: "Stop" });
    assert.equal(store.usage("s").length, 2);
    assert.equal(store.events("s").length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("common credential shapes are redacted before storage", () => {
  const text = redact(
    "token sk-ant-abcdefghijklmnopqrstuvwxyz0123 and ghp_abcdefghijklmnopqrstuvwxyz123456 AKIAABCDEFGHIJKLMNOP",
  );
  assert.equal(text.includes("sk-ant"), false);
  assert.equal(text.includes("ghp_"), false);
  assert.equal(text.includes("AKIA"), false);
});

test("relative JS/TS imports resolve to repository files", () => {
  const known = new Set(["src/a.ts", "src/lib/b.tsx", "src/lib/index.ts", "src/c.js"]);
  const text = `import x from "./lib/b";\nimport { y } from './lib';\nconst z = require("./c.js");\nimport "react";`;
  assert.deepEqual(resolveImports("src/a.ts", text, known).sort(), [
    "src/c.js",
    "src/lib/b.tsx",
    "src/lib/index.ts",
  ]);
});

test("infrastructure is detected from compose, hosting config, dependencies and CI", () => {
  const files: Record<string, string> = {
    "docker-compose.yml":
      "services:\n  api:\n    build: ./api\n    ports: ['8080:8080']\n    depends_on: [db]\n  db:\n    image: postgres:16\n",
    "api/package.json": JSON.stringify({ dependencies: { stripe: "1", pg: "1" } }),
    "web/vercel.json": "{}",
    "web/package.json": JSON.stringify({ name: "web", dependencies: { next: "1" } }),
    ".github/workflows/ci.yml":
      "name: CI\njobs:\n  d:\n    steps:\n      - run: npx vercel deploy\n",
  };
  const map = detectInfra({ list: Object.keys(files), read: (p) => files[p] ?? null });
  const byId = Object.fromEntries(map.services.map((s) => [s.id, s]));
  assert.equal(byId["compose:api"].sourceDir, "api");
  assert.equal(byId["compose:db"].kind, "database");
  assert.equal(byId["vercel:web"].kind, "web");
  assert.equal(byId["dep:stripe"].basis, "inferred");
  assert.equal(
    byId["dep:postgres"],
    undefined,
    "pg maps onto the compose database instead of a duplicate",
  );
  const has = (from: string, to: string, kind: string) =>
    map.links.some((l) => l.from === from && l.to === to && l.kind === kind);
  assert.ok(has("compose:api", "compose:db", "depends_on"));
  assert.ok(has("compose:api", "dep:stripe", "calls"));
  assert.ok(has("ci:ci.yml", "vercel:web", "deploys"));
});

test("connect adds hooks once, keeps other hooks, and removes only its own", () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-"));
  try {
    const file = join(dir, ".claude", "settings.local.json");
    connect(dir);
    connect(dir);
    let settings = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(settings.hooks.PreToolUse.length, 1);
    settings.hooks.PreToolUse.push({ hooks: [{ type: "command", command: "echo mine" }] });
    writeFileSync(file, JSON.stringify(settings));
    connect(dir, true);
    settings = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(settings.hooks, {
      PreToolUse: [{ hooks: [{ type: "command", command: "echo mine" }] }],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
