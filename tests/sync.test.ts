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
import {
  loadSync,
  pending,
  type SyncConfig,
  saveSync,
  syncOnce,
  toUpload,
} from "../server/sync.ts";

// A real recorded session with secrets in every content field; none may reach the upload.
function recorded(remote: string | null) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "quoli-sync-")));
  execFileSync("git", ["init", "-q", dir]);
  if (remote) execFileSync("git", ["-C", dir, "remote", "add", "origin", remote]);
  const store = new Store(":memory:");
  let s = 0;
  const send = (p: Record<string, unknown>) =>
    ingest(
      store,
      { session_id: "s1", cwd: dir, ...p },
      new Date(Date.UTC(2026, 10, 12, 10, 0, s++)).toISOString(),
    );
  send({ hook_event_name: "SessionStart", source: "startup" });
  send({ hook_event_name: "UserPromptSubmit", prompt: "SECRET-PROMPT fix the grading script" });
  const call = {
    tool_name: "Edit",
    tool_use_id: "t1",
    tool_input: {
      file_path: join(dir, "secret-file.py"),
      old_string: "SECRET-OLD",
      new_string: "SECRET-NEW",
    },
  };
  send({ hook_event_name: "PreToolUse", ...call });
  send({ hook_event_name: "PostToolUse", ...call, tool_response: "SECRET-OUTPUT" });
  send({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_use_id: "t2",
    tool_input: { command: "SECRET-COMMAND" },
  });
  send({
    hook_event_name: "PostToolUseFailure",
    tool_name: "Bash",
    tool_use_id: "t2",
    tool_input: { command: "SECRET-COMMAND" },
    error: "SECRET-ERROR",
  });
  send({ hook_event_name: "Stop" });
  const d = deriveSession(store.events("s1"), store.usage("s1"), defaultPrices());
  assert.ok(d);
  return { d, dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const config = (o: Partial<SyncConfig> = {}): SyncConfig => ({
  enabled: true,
  url: "https://example.supabase.co/",
  anonKey: "anon",
  key: `qk_${"a".repeat(48)}`,
  since: "2026-11-12T09:00:00.000Z",
  lastSyncAt: null,
  lastError: null,
  sent: 0,
  ...o,
});

test("an upload carries only the allow-listed summary, never content, paths or titles", () => {
  const { d, dir, done } = recorded("git@github.com:student/hw1.git");
  try {
    const u = toUpload(d);
    assert.deepEqual(Object.keys(u).sort(), [
      "agent",
      "branch",
      "cacheReadTokens",
      "cacheWriteTokens",
      "calls",
      "durationMs",
      "endedAt",
      "failures",
      "inputTokens",
      "loops",
      "model",
      "outputTokens",
      "repo",
      "sessionId",
      "startedAt",
      "usd",
    ]);
    assert.equal(u.repo, "student/hw1");
    assert.equal(u.calls, 2);
    assert.equal(u.failures, 1);
    const text = JSON.stringify(u);
    assert.doesNotMatch(text, /SECRET/);
    assert.ok(!text.includes(dir), "no local folder path");
  } finally {
    done();
  }
});

test("a repository without a GitHub remote is sent as null, not its folder name", () => {
  const { d, done } = recorded(null);
  try {
    assert.equal(toUpload(d).repo, null);
  } finally {
    done();
  }
});

test("only sessions started after sync was turned on, and changed since the last sync, are sent", () => {
  const { d, done } = recorded(null);
  try {
    assert.equal(pending([d], config()).length, 1);
    assert.equal(pending([d], config({ since: "2026-11-12T11:00:00.000Z" })).length, 0);
    assert.equal(pending([d], config({ since: null })).length, 0);
    assert.equal(pending([d], config({ lastSyncAt: "2026-11-12T12:00:00.000Z" })).length, 0);
    assert.equal(pending([d], config({ lastSyncAt: "2026-11-12T10:01:00.000Z" })).length, 1);
  } finally {
    done();
  }
});

test("syncOnce posts to submit_summaries with the anon key and records the outcome", async () => {
  const { d, done } = recorded(null);
  try {
    const seen: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response("1", { status: 200 });
    }) as typeof fetch;
    const now = new Date("2026-11-12T12:00:00Z");
    const next = await syncOnce(config(), [d], { fetchImpl: ok, now });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "https://example.supabase.co/rest/v1/rpc/submit_summaries");
    const headers = seen[0].init.headers as Record<string, string>;
    assert.equal(headers.apikey, "anon");
    const body = JSON.parse(String(seen[0].init.body));
    assert.equal(body.p_key, config().key);
    assert.equal(body.p_rows.length, 1);
    assert.equal(next.lastSyncAt, now.toISOString());
    assert.equal(next.sent, 1);
    assert.equal(next.lastError, null);

    const refused = (async () =>
      new Response(JSON.stringify({ message: "unknown sync key" }), {
        status: 400,
      })) as typeof fetch;
    const failed = await syncOnce(config(), [d], { fetchImpl: refused, now });
    assert.equal(failed.lastError, "unknown sync key");
    assert.equal(failed.lastSyncAt, null);

    const off = await syncOnce(config({ enabled: false }), [d], { fetchImpl: refused });
    assert.equal(off.lastError, null);
  } finally {
    done();
  }
});

test("the saved sync settings never include the service address, which comes from the build", () => {
  const store = new Store(":memory:");
  saveSync(store, config());
  const raw = JSON.parse(store.getSetting("sync") ?? "{}");
  assert.equal(raw.url, undefined);
  assert.equal(raw.anonKey, undefined);
  assert.equal(loadSync(store).key, config().key);
});
