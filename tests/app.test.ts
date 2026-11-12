import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyRetention, createApp, json, reviewReasons } from "../server/app.ts";
import { hooksInstalled } from "../server/connect.ts";
import { projectId, type RawEvent, Store } from "../server/db.ts";
import { ingest } from "../server/ingest.ts";
import { defaultPrices } from "../server/prices.ts";
import { deriveSession } from "../server/sessions.ts";

// Projects also list agents set up for every repository (read from HOME): keep the real one out.
process.env.HOME = realpathSync(mkdtempSync(join(tmpdir(), "quoli-app-home-")));

const DAY = 86_400_000;

function tmp() {
  return realpathSync(mkdtempSync(join(tmpdir(), "quoli-app-")));
}

function repo() {
  const dir = tmp();
  execFileSync("git", ["init", "-q", dir]);
  return dir;
}

/** Starts the API on a random loopback port with an in-memory store. */
async function start() {
  const store = new Store(":memory:");
  let port = 0;
  const app = createApp(store, () => port);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!(await app.api(req, res, url))) json(res, 404, {});
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
  const call = async (method: string, path: string, body?: unknown, headers: object = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method === "GET" ? {} : { Origin: `http://127.0.0.1:${port}` }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // biome-ignore lint/suspicious/noExplicitAny: loose JSON in tests
    return { status: res.status, body: (await res.json()) as any };
  };
  return { store, call, close: () => server.close() };
}

const hook = (root: string, session: string, event: string, extra = {}, at?: string) =>
  ingest(store0, { session_id: session, cwd: root, hook_event_name: event, ...extra }, at);
let store0: Store;

test("project id is a stable 12-hex hash and hookStatus follows hooks and events", async () => {
  const { store, call, close } = await start();
  store0 = store;
  const dir = repo();
  try {
    assert.match(projectId(dir), /^[0-9a-f]{12}$/);
    const added = await call("POST", "/api/projects", { path: dir });
    assert.equal(added.status, 200);
    assert.equal(added.body.id, projectId(dir));
    assert.equal(added.body.hookStatus, "installed");
    assert.ok(added.body.connectedAt);
    assert.equal(hooksInstalled(dir), true);

    hook(dir, "s1", "SessionStart");
    let list = await call("GET", "/api/projects");
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].hookStatus, "receiving");
    assert.equal(list.body[0].sessions, 1);

    const off = await call("POST", `/api/projects/${projectId(dir)}/disconnect`, {});
    assert.equal(off.body.hookStatus, "not_connected");
    assert.equal(off.body.sessions, 1);
    assert.equal(hooksInstalled(dir), false);

    // A root with events but never connected through Quoli still appears.
    const other = repo();
    hook(other, "s2", "SessionStart");
    list = await call("GET", "/api/projects");
    assert.equal(list.body.length, 2);
    assert.equal(list.body.find((p: { root: string }) => p.root === other).connectedAt, null);
    rmSync(other, { recursive: true, force: true });
  } finally {
    close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("connecting validates the path: relative, missing, non-git and sub-directories are refused", async () => {
  const { call, close } = await start();
  const dir = repo();
  const plain = tmp();
  mkdirSync(join(dir, "sub"));
  try {
    for (const path of ["relative/path", join(dir, "missing"), plain, join(dir, "sub"), 5]) {
      const r = await call("POST", "/api/projects", { path });
      assert.equal(r.status, 400, String(path));
      assert.equal(typeof r.body.error, "string");
    }
    assert.equal(hooksInstalled(plain), false);
    assert.equal(hooksInstalled(join(dir, "sub")), false);
  } finally {
    close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(plain, { recursive: true, force: true });
  }
});

test("deleting a project removes its events, usage and transcript offsets and unregisters it", async () => {
  const { store, call, close } = await start();
  store0 = store;
  const dir = repo();
  const keep = repo();
  try {
    await call("POST", "/api/projects", { path: dir });
    hook(dir, "gone", "SessionStart");
    hook(dir, "gone", "Stop");
    hook(keep, "kept", "SessionStart");
    const usage = (sessionId: string, messageId: string) => ({
      messageId,
      sessionId,
      agentId: "main",
      model: null,
      at: new Date().toISOString(),
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
    });
    store.upsertUsage(usage("gone", "m1"));
    store.upsertUsage(usage("kept", "m2"));
    store.setTranscriptOffset("/t/gone.jsonl", "gone", "main", 10);
    store.setTranscriptOffset("/t/kept.jsonl", "kept", "main", 10);

    const r = await call("DELETE", `/api/projects/${projectId(dir)}`, {});
    assert.deepEqual(r.body, { events: 2, sessions: 1 });
    assert.equal(store.events("gone").length, 0);
    assert.equal(store.usage("gone").length, 0);
    assert.equal(store.transcriptOffset("/t/gone.jsonl"), 0);
    assert.equal(hooksInstalled(dir), false);
    assert.equal(store.events("kept").length, 1);
    assert.equal(store.usage("kept").length, 1);
    assert.equal(store.transcriptOffset("/t/kept.jsonl"), 10);
    const list = await call("GET", "/api/projects");
    assert.deepEqual(
      list.body.map((p: { root: string }) => p.root),
      [keep],
    );
  } finally {
    close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(keep, { recursive: true, force: true });
  }
});

test("retention deletes only whole sessions whose last event is older than the window", () => {
  const store = new Store(":memory:");
  store0 = store;
  const now = Date.now();
  const at = (days: number) => new Date(now - days * DAY).toISOString();
  hook("/r", "old", "SessionStart", {}, at(40));
  hook("/r", "old", "Stop", {}, at(39));
  // Started long ago but still active recently: kept whole.
  hook("/r", "long", "SessionStart", {}, at(40));
  hook("/r", "long", "Stop", {}, at(1));
  hook("/r", "new", "SessionStart", {}, at(2));
  store.upsertUsage({
    messageId: "u",
    sessionId: "old",
    agentId: "main",
    model: null,
    at: at(39),
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
  });
  store.setTranscriptOffset("/t/old.jsonl", "old", "main", 5);

  assert.equal(applyRetention(store, now), 0, "keeps everything by default");
  store.saveSettings({ ...store.settings(), retentionDays: 30 });
  assert.equal(applyRetention(store, now), 1);
  assert.equal(store.events("old").length, 0);
  assert.equal(store.usage("old").length, 0);
  assert.equal(store.transcriptOffset("/t/old.jsonl"), 0);
  assert.equal(store.events("long").length, 2);
  assert.equal(store.events("new").length, 1);
});

test("overview reports plain-sentence review reasons and token totals", async () => {
  const { store, call, close } = await start();
  store0 = store;
  try {
    const now = Date.now();
    const at = (ms: number) => new Date(now - ms).toISOString();
    const root = "/o";
    // Ended session: one failure, an edit, no command afterwards.
    let t = 3 * 3_600_000;
    const step = () => {
      t -= 1000;
      return at(t);
    };
    hook(root, "a", "SessionStart", {}, step());
    hook(
      root,
      "a",
      "PreToolUse",
      { tool_name: "Bash", tool_use_id: "b1", tool_input: { command: "x" } },
      step(),
    );
    hook(
      root,
      "a",
      "PostToolUseFailure",
      { tool_name: "Bash", tool_use_id: "b1", error: "no" },
      step(),
    );
    hook(
      root,
      "a",
      "PreToolUse",
      { tool_name: "Edit", tool_use_id: "e1", tool_input: { file_path: `${root}/a.ts` } },
      step(),
    );
    hook(root, "a", "SessionEnd", {}, step());
    // Ended session: edit followed by a command, clean.
    hook(root, "b", "SessionStart", {}, step());
    hook(
      root,
      "b",
      "PreToolUse",
      { tool_name: "Edit", tool_use_id: "e2", tool_input: { file_path: `${root}/b.ts` } },
      step(),
    );
    hook(
      root,
      "b",
      "PreToolUse",
      { tool_name: "Bash", tool_use_id: "b2", tool_input: { command: "test" } },
      step(),
    );
    hook(root, "b", "SessionEnd", {}, step());
    // Live session with many edited files: not listed for review while live.
    hook(root, "c", "SessionStart", {}, at(1000));
    store.upsertUsage({
      messageId: "m",
      sessionId: "a",
      agentId: "main",
      model: null,
      at: at(1000),
      input: 7,
      output: 3,
      cacheRead: 0,
      cacheWrite: 0,
    });
    store.upsertUsage({
      messageId: "old",
      sessionId: "a",
      agentId: "main",
      model: null,
      at: at(3 * DAY),
      input: 100,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });

    const { body } = await call("GET", "/api/overview");
    assert.equal(body.live.length, 1);
    assert.equal(body.live[0].id, "c");
    assert.equal(body.needsReview.length, 1);
    assert.equal(body.needsReview[0].session.id, "a");
    assert.deepEqual(body.needsReview[0].reasons, [
      "1 failed tool call",
      "No command was run after the last edit",
    ]);
    assert.equal(body.recent.length, 3);
    assert.equal(body.tokens.week.input, 107);
    assert.equal(body.counts.sessions, 3);
    assert.equal(body.counts.projects, 1);
    assert.ok(body.tokens.today.input === 7 || body.tokens.today.input === 0);
  } finally {
    close();
  }
});

test("ten or more changed files is a review reason", () => {
  const events: RawEvent[] = [];
  const e = (event: string, payload: Record<string, unknown>) =>
    events.push({
      seq: events.length + 1,
      sessionId: "m",
      root: "/m",
      event,
      at: `2026-01-01T00:00:${String(events.length).padStart(2, "0")}Z`,
      payload,
    });
  e("SessionStart", {});
  for (let i = 0; i < 10; i++) {
    e("PreToolUse", {
      tool_name: "Write",
      tool_use_id: `w${i}`,
      tool_input: { file_path: `/m/f${i}` },
    });
  }
  e("PreToolUse", { tool_name: "Bash", tool_use_id: "r", tool_input: { command: "t" } });
  const d = deriveSession(events, [], defaultPrices());
  assert.ok(d);
  assert.deepEqual(reviewReasons(d), ["10 files changed"]);
});

test("session titles drop image placeholders and collapse whitespace", () => {
  const title = (...prompts: string[]) => {
    const events: RawEvent[] = [
      {
        seq: 1,
        sessionId: "t",
        root: "/t",
        event: "SessionStart",
        at: "2026-01-01T00:00:00Z",
        payload: {},
      },
      ...prompts.map((prompt, i) => ({
        seq: i + 2,
        sessionId: "t",
        root: "/t",
        event: "UserPromptSubmit",
        at: "2026-01-01T00:00:01Z",
        payload: { prompt },
      })),
    ];
    return deriveSession(events, [], defaultPrices());
  };
  assert.equal(title("[Image #4]  fix   the\tbug [Image #5]")?.title, "fix the bug");
  assert.equal(title("[Image #4]\nSecond line")?.title, "Second line");
  assert.equal(title("[Image #4] [Image #5]")?.title, "Image prompt");
  assert.equal(title("[Image #4] hi")?.turns[0].prompt, "[Image #4] hi");
  assert.match(title()?.title ?? "", /^Session /);
});

test("settings are validated, saved, and drive redaction", async () => {
  const { store, call, close } = await start();
  store0 = store;
  try {
    const first = await call("GET", "/api/settings");
    assert.deepEqual(first.body.settings, {
      retentionDays: null,
      redact: true,
      budgetDailyUsd: null,
      budgetMonthlyUsd: null,
      livePrices: true,
    });
    assert.equal(typeof first.body.info.port, "number");
    assert.match(first.body.info.version, /^\d+\.\d+\.\d+/);

    for (const bad of [
      { retentionDays: 0 },
      { retentionDays: 3651 },
      { retentionDays: 1.5 },
      { retentionDays: "7" },
      { redact: "no" },
      { livePrices: "yes" },
      { other: 1 },
    ]) {
      assert.equal((await call("PUT", "/api/settings", bad)).status, 400, JSON.stringify(bad));
    }
    const ok = await call("PUT", "/api/settings", { retentionDays: 30, redact: false });
    assert.deepEqual(ok.body.settings, {
      retentionDays: 30,
      redact: false,
      budgetDailyUsd: null,
      budgetMonthlyUsd: null,
      livePrices: true,
    });

    const secret = "sk-ant-abcdefghijklmnopqrstuvwxyz0123";
    hook("/s", "x", "UserPromptSubmit", { prompt: secret });
    assert.equal(store.events("x")[0].payload.prompt, secret);
    await call("PUT", "/api/settings", { redact: true });
    hook("/s", "y", "UserPromptSubmit", { prompt: secret });
    assert.equal(store.events("y")[0].payload.prompt, "[redacted]");

    const preview = await call("POST", "/api/redact-preview", { text: `a ${secret}` });
    assert.equal(preview.body.text, "a [redacted]");
    assert.equal((await call("POST", "/api/redact-preview", { text: 1 })).status, 400);
  } finally {
    close();
  }
});

test("mutating API calls need a JSON content type and a same-origin Origin header", async () => {
  const { call, close } = await start();
  try {
    const noOrigin = await fetch(
      `http://127.0.0.1:${(await call("GET", "/api/settings")).body.info.port}/api/settings`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    assert.equal(noOrigin.status, 403);
    assert.equal(
      (await call("PUT", "/api/settings", {}, { Origin: "http://evil.example" })).status,
      403,
    );
    assert.equal(
      (await call("PUT", "/api/settings", {}, { "Content-Type": "text/plain" })).status,
      403,
    );
    assert.equal((await call("PUT", "/api/settings", {})).status, 200);
    const { info } = (await call("GET", "/api/settings")).body;
    assert.equal(
      (await call("PUT", "/api/settings", {}, { Origin: `http://localhost:${info.port}` })).status,
      200,
    );
  } finally {
    close();
  }
});

test("sessions list spans projects and filters by project id", async () => {
  const { store, call, close } = await start();
  store0 = store;
  try {
    hook("/p1", "s1", "SessionStart", {}, "2026-01-01T00:00:00Z");
    hook("/p2", "s2", "SessionStart", {}, "2026-01-02T00:00:00Z");
    const all = await call("GET", "/api/sessions");
    assert.deepEqual(
      all.body.map((s: { id: string; projectId: string }) => [s.id, s.projectId]),
      [
        ["s2", projectId("/p2")],
        ["s1", projectId("/p1")],
      ],
    );
    const one = await call("GET", `/api/sessions?project=${projectId("/p1")}`);
    assert.deepEqual(
      one.body.map((s: { id: string; projectId: string }) => s.id),
      ["s1"],
    );
    assert.equal((await call("GET", "/api/sessions?project=000000000000")).status, 404);
  } finally {
    close();
  }
});

test("derived sessions are cached until the session changes or prices change", async () => {
  const { store, call, close } = await start();
  store0 = store;
  const dir = repo();
  try {
    hook(dir, "c1", "SessionStart");
    hook(dir, "c1", "UserPromptSubmit", { prompt: "first" });
    const first = await call("GET", "/api/session?id=c1");
    assert.equal(first.body.turns.length, 1);

    // An unchanged session is served from the cache without reading its events again.
    const events = store.events.bind(store);
    let reads = 0;
    store.events = (id: string) => {
      reads++;
      return events(id);
    };
    await call("GET", "/api/session?id=c1");
    await call("GET", "/api/sessions");
    assert.equal(reads, 0);

    // A new event invalidates it.
    hook(dir, "c1", "UserPromptSubmit", { prompt: "second" });
    const second = await call("GET", "/api/session?id=c1");
    assert.equal(second.body.turns.length, 2);
    assert.equal(reads, 1);

    // So does a price change, and deleting the session makes it a 404.
    const prices = defaultPrices();
    prices.version = "edited";
    await call("PUT", "/api/prices", prices);
    assert.equal((await call("GET", "/api/session?id=c1")).body.report.priceVersion, "edited");
    store.deleteSessions(["c1"]);
    assert.equal((await call("GET", "/api/session?id=c1")).status, 404);
  } finally {
    close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("services added by hand are saved per project, merged into the infra map and removable", async () => {
  const { call, close } = await start();
  const dir = repo();
  try {
    const pid = (await call("POST", "/api/projects", { path: dir })).body.id;
    const base = `/api/projects/${pid}/services`;
    const bad = await call("POST", base, {
      name: "x",
      kind: "web",
      provider: "vercel",
      url: "javascript:alert(1)",
    });
    assert.equal(bad.status, 400);
    assert.equal(
      (await call("POST", base, { name: "x", kind: "pipeline", provider: "aws" })).status,
      400,
    );

    const added = await call("POST", base, {
      name: "Production web",
      kind: "web",
      provider: "vercel",
      url: "https://vercel.com/acme/web",
      sourceDir: "apps/web",
    });
    assert.equal(added.status, 200);
    const entry = added.body[0];
    let infra = (await call("GET", `/api/infra?root=${encodeURIComponent(dir)}`)).body;
    const card = infra.services.find((s: { manual: string }) => s.manual === entry.id);
    assert.equal(card.name, "Production web");
    assert.equal(card.platform, "vercel");
    assert.equal(card.evidence, "added by you");
    assert.equal(card.metrics, null);

    const edited = await call("PUT", `${base}/${entry.id}`, { ...entry, name: "Web" });
    assert.equal(edited.body[0].name, "Web");
    assert.equal((await call("PUT", `${base}/m-ffffffff`, entry)).status, 404);

    await call("DELETE", `${base}/${entry.id}`, {});
    infra = (await call("GET", `/api/infra?root=${encodeURIComponent(dir)}`)).body;
    assert.ok(infra.services.every((s: { manual: string | null }) => s.manual === null));
  } finally {
    close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the live stream names the session for every agent, including OpenCode's sessionID", async () => {
  const store = new Store(":memory:");
  let port = 0;
  const app = createApp(store, () => port);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!(await app.api(req, res, url))) json(res, 404, {});
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
  const dir = repo();
  const stop = new AbortController();
  try {
    const stream = await fetch(`http://127.0.0.1:${port}/api/stream`, { signal: stop.signal });
    const post = (agent: string, body: object) =>
      fetch(`http://127.0.0.1:${port}/ingest?agent=${agent}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    await post("opencode", { opencode_event: "session.start", sessionID: "ses_live", cwd: dir });
    await post("claude-code", { hook_event_name: "Stop", session_id: "cc_live", cwd: dir });
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
    let text = "";
    while (!text.includes("cc_live")) text += new TextDecoder().decode((await reader.read()).value);
    const ids = [...text.matchAll(/"sessionId":"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids, ["ses_live", "cc_live"]);
  } finally {
    stop.abort();
    server.closeAllConnections();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
