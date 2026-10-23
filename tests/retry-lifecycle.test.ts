import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeHook } from "../apps/bridge/src/normalize";
import { startCollector } from "../apps/collector/src/server";
import { claudeHookSamples } from "../fixtures/claude";
import {
  type CapturePolicy,
  defaultPolicy,
  type NormalizedEvent,
} from "../packages/schema/src/index";
import { Store } from "../packages/storage/src/index";
import { credential } from "../packages/storage/src/runtime";
import { drainSpool, purgeProjectSpool, spool, spoolPath } from "../packages/storage/src/spool";

const openPolicy: CapturePolicy = { ...defaultPolicy, prompt: true, tool: true, code: true };

type Entry = { spooledAt: string | null; epoch: number | null; event: NormalizedEvent };

function entries(dir: string): Entry[] {
  const path = join(dir, "bridge-spool.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Entry);
}

function promptEvent(projectId: string, text = "traceframe-lifecycle-canary"): NormalizedEvent {
  const sample = claudeHookSamples().find((item) => item.hook_event_name === "UserPromptSubmit");
  assert.ok(sample);
  const event = normalizeHook(
    { ...sample, prompt: text },
    { projectId, sessionId: "session-probe" },
  );
  assert.ok(event);
  return event;
}

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function withCollector(
  store: Store,
  run: (url: string, headers: Record<string, string>) => Promise<void>,
): Promise<void> {
  const server = startCollector(0, store);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`, {
      Authorization: `Bearer ${credential()}`,
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function runHook(dir: string, project: string, payload: unknown, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "apps/bridge/src/index.ts", project],
      {
        env: {
          ...process.env,
          TRACEFRAME_DATA_DIR: dir,
          TRACEFRAME_COLLECTOR_PORT: String(port),
        },
        stdio: ["pipe", "ignore", "ignore"],
      },
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`hook exited with ${code}`)),
    );
    child.stdin.end(JSON.stringify(payload));
  });
}

test("the purge endpoint removes only the deleted project's retries", async () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-purge-"));
  const previous = process.env.TRACEFRAME_DATA_DIR;
  process.env.TRACEFRAME_DATA_DIR = dir;
  const store = new Store(join(dir, "traceframe.sqlite"));
  store.registerProject("alpha", "Alpha", false, openPolicy);
  store.registerProject("beta", "Beta", false, openPolicy);
  try {
    spool(promptEvent("alpha"));
    spool(promptEvent("beta"));
    await withCollector(store, async (url, headers) => {
      const response = await fetch(`${url}/v1/projects/alpha/purge`, { method: "POST", headers });
      assert.equal(response.status, 200);
      assert.deepEqual(
        entries(dir).map((entry) => entry.event.projectId),
        ["beta"],
      );
    });
  } finally {
    if (previous === undefined) delete process.env.TRACEFRAME_DATA_DIR;
    else process.env.TRACEFRAME_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a retry from before a purge cannot reappear after re-registration", async () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-epoch-"));
  const previous = process.env.TRACEFRAME_DATA_DIR;
  process.env.TRACEFRAME_DATA_DIR = dir;
  const store = new Store(join(dir, "traceframe.sqlite"));
  store.registerProject("alpha", "Alpha", false, openPolicy);
  try {
    const stale = promptEvent("alpha");
    assert.equal(spool(stale), "stored");
    // A purge without spool cleanup simulates a stale writer racing the owner.
    store.purgeProject("alpha");
    store.registerProject("alpha", "Alpha", false, openPolicy);
    const delivered: string[] = [];
    const first = await drainSpool(async (event) => {
      delivered.push(event.id);
      return true;
    });
    assert.equal(delivered.length, 0);
    assert.equal(first.dropped, 1);
    assert.equal(first.remaining, 0);
    assert.equal(entries(dir).length, 0);

    // A retry written by the pre-fencing code has no generation: it must be
    // dropped too, not guessed back into the re-registered project.
    writeFileSync(spoolPath(), `${JSON.stringify(stale)}\n`, { mode: 0o600 });
    const second = await drainSpool(async (event) => {
      delivered.push(event.id);
      return true;
    });
    assert.deepEqual(delivered, []);
    assert.equal(second.dropped, 1);
    assert.equal(entries(dir).length, 0);
  } finally {
    store.close();
    if (previous === undefined) delete process.env.TRACEFRAME_DATA_DIR;
    else process.env.TRACEFRAME_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("project cleanup covers an interrupted drain and repeats without effect", async () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-cleanup-"));
  const previous = process.env.TRACEFRAME_DATA_DIR;
  process.env.TRACEFRAME_DATA_DIR = dir;
  const store = new Store(join(dir, "traceframe.sqlite"));
  store.registerProject("alpha", "Alpha", false, openPolicy);
  store.registerProject("beta", "Beta", false, openPolicy);
  try {
    spool(promptEvent("alpha", "alpha one"));
    spool(promptEvent("alpha", "alpha two"));
    spool(promptEvent("beta"));
    // An interrupted drain leaves its rotated file behind.
    writeFileSync(
      `${spoolPath()}.draining`,
      `${JSON.stringify({ spooledAt: new Date().toISOString(), epoch: 1, event: promptEvent("alpha", "alpha three") })}\n`,
      { mode: 0o600 },
    );
    assert.deepEqual(purgeProjectSpool("alpha"), { removed: 3 });
    assert.deepEqual(purgeProjectSpool("alpha"), { removed: 0 });
    assert.deepEqual(
      entries(dir).map((entry) => entry.event.projectId),
      ["beta"],
    );
  } finally {
    store.close();
    if (previous === undefined) delete process.env.TRACEFRAME_DATA_DIR;
    else process.env.TRACEFRAME_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a policy reduction scrubs only that project's pending retries", async () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-policy-change-"));
  const previous = process.env.TRACEFRAME_DATA_DIR;
  process.env.TRACEFRAME_DATA_DIR = dir;
  const store = new Store(join(dir, "traceframe.sqlite"));
  store.registerProject("alpha", "Alpha", false, openPolicy);
  store.registerProject("beta", "Beta", false, openPolicy);
  const canary = "traceframe-policy-change-canary";
  try {
    spool(promptEvent("alpha", canary));
    spool(promptEvent("beta", canary));
    await withCollector(store, async (url, headers) => {
      const response = await fetch(`${url}/v1/projects/alpha/settings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ policy: { prompt: false } }),
      });
      assert.equal(response.status, 200);
    });
    const stored = entries(dir);
    assert.equal(stored.length, 2);
    const alpha = stored.find((entry) => entry.event.projectId === "alpha");
    const beta = stored.find((entry) => entry.event.projectId === "beta");
    assert.ok(alpha && beta);
    if (alpha.event.payload.kind === "prompt") {
      assert.equal(alpha.event.payload.content.text, null);
      assert.equal(alpha.event.payload.content.state, "disabled");
    }
    if (beta.event.payload.kind === "prompt") assert.equal(beta.event.payload.content.text, canary);
    assert.equal(readFileSync(join(dir, "bridge-spool.jsonl"), "utf8").split(canary).length - 1, 1);
  } finally {
    if (previous === undefined) delete process.env.TRACEFRAME_DATA_DIR;
    else process.env.TRACEFRAME_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("retention removes expired pending retries through the settings endpoint", async () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-retention-"));
  const previous = process.env.TRACEFRAME_DATA_DIR;
  process.env.TRACEFRAME_DATA_DIR = dir;
  const store = new Store(join(dir, "traceframe.sqlite"));
  store.registerProject("alpha", "Alpha", false, openPolicy);
  try {
    spool(promptEvent("alpha"));
    const [entry] = entries(dir);
    assert.ok(entry);
    writeFileSync(
      spoolPath(),
      `${JSON.stringify({ ...entry, spooledAt: "2020-01-01T00:00:00.000Z" })}\n`,
      { mode: 0o600 },
    );
    await withCollector(store, async (url, headers) => {
      const response = await fetch(`${url}/v1/projects/alpha/settings`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: 1 }),
      });
      assert.equal(response.status, 200);
    });
    assert.equal(entries(dir).length, 0);
  } finally {
    if (previous === undefined) delete process.env.TRACEFRAME_DATA_DIR;
    else process.env.TRACEFRAME_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrent hook appends and a purge preserve the other project", async () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-concurrent-"));
  const previous = process.env.TRACEFRAME_DATA_DIR;
  process.env.TRACEFRAME_DATA_DIR = dir;
  const store = new Store(join(dir, "traceframe.sqlite"));
  store.registerProject("alpha", "Alpha", false, openPolicy);
  store.registerProject("beta", "Beta", false, openPolicy);
  const unreachable = await freePort();
  try {
    const payload = claudeHookSamples().find((item) => item.hook_event_name === "UserPromptSubmit");
    assert.ok(payload);
    const hooks = [
      ...Array.from({ length: 4 }, () => runHook(dir, "alpha", payload, unreachable)),
      ...Array.from({ length: 4 }, () => runHook(dir, "beta", payload, unreachable)),
    ];
    await withCollector(store, async (url, headers) => {
      const response = await fetch(`${url}/v1/projects/alpha/purge`, { method: "POST", headers });
      assert.equal(response.status, 200);
    });
    await Promise.all(hooks);
    assert.equal(entries(dir).filter((entry) => entry.event.projectId === "beta").length, 4);
    const delivered: string[] = [];
    const result = await drainSpool(async (event) => {
      delivered.push(event.projectId);
      return true;
    });
    assert.deepEqual(
      delivered.filter((project) => project === "alpha"),
      [],
    );
    assert.equal(delivered.length, 4);
    assert.equal(result.sent, 4);
    assert.equal(entries(dir).length, 0);
  } finally {
    if (previous === undefined) delete process.env.TRACEFRAME_DATA_DIR;
    else process.env.TRACEFRAME_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
