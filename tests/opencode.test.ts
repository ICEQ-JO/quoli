import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { normalizeOpenCode, openCodeAdapter } from "../apps/bridge/src/opencode";
import {
  installOpenCode,
  openCodeStatus,
  openCodeUsesRuntime,
  uninstallOpenCode,
} from "../apps/bridge/src/opencode-install";
import { startCollector } from "../apps/collector/src/server";
import { openCodeObservations, openCodeSamples } from "../fixtures/opencode";
import { activity } from "../packages/analysis/src/activity";
import { usage } from "../packages/analysis/src/usage";
import { defaultPolicy, eventSchema } from "../packages/schema/src/index";
import { Store } from "../packages/storage/src/index";
import { credential, initializeCredential, runtime } from "../packages/storage/src/runtime";
import { cleanupProjectSpool, drainSpool, spoolDepth } from "../packages/storage/src/spool";

test("OpenCode source-shaped fixtures preserve explicit identities, tools, child scope and usage", () => {
  const events = openCodeObservations().flatMap((input) => {
    const event = normalizeOpenCode(input, "repo_synthetic");
    if (!event) return [];
    assert.ok(eventSchema.safeParse(event).success);
    assert.equal(event.id, normalizeOpenCode(input, "repo_synthetic")?.id);
    assert.equal(event.payload.kind, openCodeAdapter.eventMapping[input.event.type]);
    assert.equal(
      event.deliveryId,
      openCodeAdapter.deliveryId({
        sessionId: event.sessionId,
        event: input.event.type,
        promptId: input.event.id,
        toolId: null,
      }),
    );
    return [{ ...event, sequence: eventsSequence++, receivedAt: "2026-10-23T12:00:00.000Z" }];
  });
  assert.equal(events.length, 8);
  assert.equal(new Set(events.map((event) => event.id)).size, events.length);
  const prompt = events.find((event) => event.payload.kind === "prompt");
  assert.equal(prompt?.promptId, "msg_user");
  const extension = events.find((event) => event.sourceLocator?.endsWith(":call_extension"));
  assert.ok(extension?.schemaVersion === 2);
  assert.deepEqual(extension.tool, { rawName: "mcp.example.inspect", category: "Other" });
  assert.equal(extension.requestId, "msg_assistant");
  const repeated = openCodeObservations()[4];
  const firstCall = normalizeOpenCode(repeated, "repo_synthetic");
  const otherCall = normalizeOpenCode(
    {
      ...repeated,
      event: {
        ...repeated.event,
        id: "evt_another_request",
        data: { ...repeated.event.data, assistantMessageID: "msg_another" },
      },
    },
    "repo_synthetic",
  );
  assert.notEqual(firstCall?.toolId, otherCall?.toolId);
  const result = events.find(
    (event) => event.payload.kind === "tool_result" && event.payload.status === "failure",
  );
  assert.ok(result?.payload.kind === "tool_result");
  assert.equal(result.payload.exitCode, null);
  const totals = usage(events);
  assert.equal(totals.requests, 1);
  assert.equal(totals.input, 20);
  assert.equal(totals.reasoning, 3);
  const priced = events.find((event) => event.payload.kind === "usage");
  assert.ok(priced?.payload.kind === "usage");
  assert.equal(priced.payload.costUsdMicros, null);
  assert.equal(activity(events).subagents[0].parent.sessionId, "ses_synthetic");
  assert.equal(activity(events).subagents[0].child.sessionId, "ses_child");
  assert.equal(activity(events).turns.length, 0);
});
let eventsSequence = 1;

test("unsupported versions and lost metadata become gaps; reasoning and synthetic inbox text are ignored", () => {
  const sample = openCodeObservations()[1];
  for (const sourceVersion of ["999.0.0", "unreported"]) {
    const event = normalizeOpenCode({ ...sample, sourceVersion }, "repo_synthetic");
    assert.equal(event?.payload.kind, "gap");
    assert.equal(JSON.stringify(event).includes("Explain the synthetic"), false);
  }
  assert.equal(
    normalizeOpenCode(
      { ...sample, event: { ...sample.event, durable: { version: 99 } } },
      "repo_synthetic",
    )?.payload.kind,
    "gap",
  );
  assert.equal(
    normalizeOpenCode(
      { ...sample, event: { ...sample.event, type: "session.reasoning.ended" } },
      "repo_synthetic",
    ),
    null,
  );
  assert.equal(
    normalizeOpenCode(
      {
        ...sample,
        event: {
          ...sample.event,
          data: {
            sessionID: "ses_synthetic",
            item: { type: "synthetic", payload: { text: "never capture" } },
          },
        },
      },
      "repo_synthetic",
    ),
    null,
  );
  const tool = openCodeObservations()[4];
  assert.equal(
    normalizeOpenCode({ ...tool, toolName: undefined }, "repo_synthetic")?.payload.kind,
    "gap",
  );
  const punctuated = normalizeOpenCode(
    { ...tool, event: { ...tool.event, data: { ...tool.event.data, id: "call:read/1" } } },
    "repo_synthetic",
  );
  assert.ok(punctuated?.toolId?.startsWith("oc-"));
  assert.ok(punctuated);
  assert.match(punctuated.sourceLocator ?? "", /call:read\/1/);
  for (const raw of [null, [], {}, { event: null }, { event: { type: "__proto__" } }])
    assert.equal(normalizeOpenCode(raw, "repo_synthetic"), null);
});

async function worker(dir: string, input: unknown, port: number): Promise<void> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "apps/bridge/src/opencode-entry.ts", "repo_synthetic"],
    {
      env: { ...process.env, TRACEFRAME_DATA_DIR: dir, TRACEFRAME_COLLECTOR_PORT: String(port) },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stdin.end(JSON.stringify(input));
  const [code] = await once(child, "exit");
  assert.equal(code, 0);
  assert.equal(output, "");
}

test("real worker applies policy before online delivery/offline retry and honors pause, purge and replay", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-opencode-worker-"));
  const previous = process.env.TRACEFRAME_DATA_DIR;
  process.env.TRACEFRAME_DATA_DIR = dir;
  const store = new Store(runtime().dbFile);
  store.registerProject("repo_synthetic", "Synthetic", false, defaultPolicy);
  initializeCredential();
  const server = startCollector(0, store);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const input = openCodeObservations()[1];
  input.event.data.item = { type: "user", payload: { text: "SYNTHETIC_PRIVATE_CANARY" } };
  try {
    await worker(dir, input, address.port);
    await worker(dir, input, address.port);
    const events = store.allEvents("repo_synthetic", "ses_synthetic");
    assert.equal(events.length, 1);
    assert.equal(JSON.stringify(events).includes("SYNTHETIC_PRIVATE_CANARY"), false);
    const offline = { ...input, event: { ...input.event, id: "evt_offline" } };
    await worker(dir, offline, 1_024);
    assert.equal(spoolDepth(), 1);
    assert.equal(
      readFileSync(join(dir, "bridge-spool.jsonl"), "utf8").includes("SYNTHETIC_PRIVATE_CANARY"),
      false,
    );
    const drained = await drainSpool(
      async (event) =>
        (
          await fetch(`http://127.0.0.1:${address.port}/v1/ingest`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${credential()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ events: [event] }),
          })
        ).ok,
    );
    assert.equal(drained.sent, 1);
    assert.equal(store.allEvents("repo_synthetic", "ses_synthetic").length, 2);
    store.updateSettings("repo_synthetic", { paused: true });
    await worker(dir, { ...input, event: { ...input.event, id: "evt_paused" } }, 1_024);
    assert.equal(spoolDepth(), 0);
    store.purgeProject("repo_synthetic");
    await worker(dir, { ...input, event: { ...input.event, id: "evt_purged" } }, 1_024);
    assert.equal(spoolDepth(), 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previous === undefined) delete process.env.TRACEFRAME_DATA_DIR;
    else process.env.TRACEFRAME_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("connect checks the OpenCode version, installs idempotently and undoes only its own plugin", () => {
  const root = mkdtempSync(join(tmpdir(), "quoli-opencode-connect-"));
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  mkdirSync(bin);
  execFileSync("git", ["init", "--quiet", repo]);
  const executable = join(bin, "opencode");
  const connect = (...args: string[]) =>
    execFileSync(process.execPath, ["--import", "tsx", "scripts/setup.ts", repo, ...args], {
      env: {
        ...process.env,
        TRACEFRAME_DATA_DIR: join(root, "data"),
        PATH: `${bin}:${process.env.PATH}`,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    writeFileSync(executable, "#!/bin/sh\nprintf 'opencode v999.0.0\\n'\n");
    chmodSync(executable, 0o755);
    assert.throws(() => connect("--agent", "opencode"));
    assert.equal(openCodeStatus(repo).installed, false);
    writeFileSync(executable, "#!/bin/sh\nprintf 'opencode v2.0.32\\n'\n");
    const output = connect("--agent", "opencode");
    assert.match(output, /OpenCode plugin written/);
    const projectId = output.match(/repo_[a-f0-9]{32}/)?.[0];
    assert.ok(projectId);
    assert.match(connect("--agent", "opencode"), /already registered/);
    assert.match(connect("--check"), /OpenCode plugin: installed/);
    connect("--undo", projectId);
    assert.equal(openCodeStatus(repo).installed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installer is reversible, preserves other configuration and refuses collisions/symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "quoli-opencode-install-"));
  const previous = process.env.QUOLI_RUNTIME_ROOT;
  try {
    mkdirSync(join(root, ".opencode/plugins"), { recursive: true });
    const other = join(root, ".opencode/plugins/other.js");
    writeFileSync(other, "// other plugin\n");
    const config = join(root, "opencode.json");
    writeFileSync(config, '{"model":"fixture/model"}\n');
    process.env.QUOLI_RUNTIME_ROOT = "/synthetic/installed quoli";
    const first = installOpenCode(root, "repo_synthetic");
    assert.equal(first.path, join(root, openCodeAdapter.install.settingsPath));
    assert.deepEqual(openCodeStatus(root), { installed: true, projectId: "repo_synthetic" });
    assert.equal(openCodeUsesRuntime(root, "/synthetic/installed quoli"), true);
    const contents = readFileSync(first.path, "utf8");
    installOpenCode(root, "repo_synthetic");
    assert.equal(readFileSync(first.path, "utf8"), contents);
    assert.throws(() => installOpenCode(root, "other_project"), /mismatch/);
    uninstallOpenCode(root);
    uninstallOpenCode(root);
    assert.equal(openCodeStatus(root).installed, false);
    assert.equal(readFileSync(other, "utf8"), "// other plugin\n");
    assert.equal(readFileSync(config, "utf8"), '{"model":"fixture/model"}\n');
    writeFileSync(first.path, "// not Quoli\n");
    assert.equal(openCodeUsesRuntime(root, "/synthetic/installed quoli"), false);
    assert.throws(() => installOpenCode(root, "repo_synthetic"), /not owned/);
    assert.throws(() => uninstallOpenCode(root), /not owned/);
    assert.throws(() =>
      execFileSync(
        process.execPath,
        ["--import", "tsx", "apps/bridge/src/index.ts", "opencode", "uninstall", root],
        { stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
    assert.equal(readFileSync(first.path, "utf8"), "// not Quoli\n");
    rmSync(first.path);
    symlinkSync(other, first.path);
    assert.throws(() => installOpenCode(root, "repo_synthetic"), /symlink/);
  } finally {
    if (previous === undefined) delete process.env.QUOLI_RUNTIME_ROOT;
    else process.env.QUOLI_RUNTIME_ROOT = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("offline file results honor exclusions before persistence and after policy changes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-opencode-results-"));
  const previous = process.env.TRACEFRAME_DATA_DIR;
  process.env.TRACEFRAME_DATA_DIR = dir;
  const store = new Store(runtime().dbFile);
  store.registerProject("repo_synthetic", "Synthetic", false, {
    ...defaultPolicy,
    prompt: true,
    tool: true,
    code: true,
  });
  const sample = openCodeObservations()[5];
  const input = {
    ...sample,
    toolPath: ".env",
    event: {
      ...sample.event,
      data: { ...sample.event.data, content: [{ type: "text", text: "EXCLUDED_RESULT_CANARY" }] },
    },
  };
  const raw = () => readFileSync(join(dir, "bridge-spool.jsonl"), "utf8");
  try {
    await worker(dir, input, 1_024);
    assert.equal(raw().includes("EXCLUDED_RESULT_CANARY"), false);
    assert.equal(raw().includes('"resultPath":".env"'), false);
    await worker(
      dir,
      { ...input, toolPath: "src/private.ts", event: { ...input.event, id: "evt_later_excluded" } },
      1_024,
    );
    assert.ok(raw().includes("EXCLUDED_RESULT_CANARY"));
    const policy = {
      ...defaultPolicy,
      prompt: true,
      tool: true,
      code: true,
      excludedPaths: ["private.ts"],
    };
    store.updateSettings("repo_synthetic", { policy });
    assert.ok(cleanupProjectSpool("repo_synthetic", policy, null).rewritten > 0);
    assert.equal(raw().includes("EXCLUDED_RESULT_CANARY"), false);
    assert.equal(raw().includes("src/private.ts"), false);
    await worker(
      dir,
      { ...input, toolPath: "src/another.ts", event: { ...input.event, id: "evt_drain_excluded" } },
      1_024,
    );
    store.updateSettings("repo_synthetic", { policy: { excludedPaths: ["another.ts"] } });
    const delivered: string[] = [];
    await drainSpool(async (event) => {
      delivered.push(JSON.stringify(event));
      return false;
    });
    assert.equal(delivered.join("").includes("EXCLUDED_RESULT_CANARY"), false);
    assert.equal(raw().includes("src/another.ts"), false);
    assert.equal(raw().includes("EXCLUDED_RESULT_CANARY"), false);
  } finally {
    store.close();
    if (previous === undefined) delete process.env.TRACEFRAME_DATA_DIR;
    else process.env.TRACEFRAME_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generated plugin consumes scoped public events through the real worker without mutating source data", async () => {
  const root = mkdtempSync(join(tmpdir(), "quoli-opencode-plugin-"));
  const previous = process.env.TRACEFRAME_DATA_DIR;
  const previousRuntime = process.env.QUOLI_RUNTIME_ROOT;
  process.env.TRACEFRAME_DATA_DIR = join(root, "data");
  delete process.env.QUOLI_RUNTIME_ROOT;
  const store = new Store(runtime().dbFile);
  store.registerProject("repo_synthetic", "Synthetic", false, {
    ...defaultPolicy,
    prompt: true,
    tool: true,
    code: true,
  });
  initializeCredential();
  try {
    const path = installOpenCode(root, "repo_synthetic").path;
    const { default: plugin } = await import(pathToFileURL(path).href);
    const frames = openCodeSamples(root);
    const original = JSON.stringify(frames);
    let consumed = false;
    const cleanup = plugin.setup({
      app: { version: "2.0.32" },
      location: { directory: root },
      event: {
        async *subscribe() {
          yield { ...frames[1], location: { directory: "/another/project" } };
          yield {
            ...frames[1],
            type: "session.reasoning.ended",
            data: { ...frames[1].data, text: "HIDDEN_REASONING_CANARY" },
          };
          for (const frame of frames) yield frame;
          consumed = true;
        },
      },
    });
    for (let n = 0; n < 500 && !consumed; n++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    await cleanup();
    assert.ok(consumed, "Generated plugin did not consume the synthetic stream");
    assert.equal(JSON.stringify(frames), original);
    const raw = readFileSync(join(runtime().dataDir, "bridge-spool.jsonl"), "utf8");
    assert.equal(raw.includes("HIDDEN_REASONING_CANARY"), false);
    assert.equal(spoolDepth(), 8);
    assert.ok(raw.includes("mcp.example.inspect"));
    assert.ok(raw.includes('"input":20'));
    const drained = await drainSpool(async (event) => {
      store.append([event]);
      return true;
    });
    assert.equal(drained.sent, 8);
    assert.equal(store.allEvents("repo_synthetic", "ses_synthetic").length, 7);
    assert.equal(store.allEvents("repo_synthetic", "ses_child").length, 1);
    assert.equal(usage(store.allEvents("repo_synthetic", "ses_synthetic")).input, 20);
  } finally {
    store.close();
    if (previous === undefined) delete process.env.TRACEFRAME_DATA_DIR;
    else process.env.TRACEFRAME_DATA_DIR = previous;
    if (previousRuntime === undefined) delete process.env.QUOLI_RUNTIME_ROOT;
    else process.env.QUOLI_RUNTIME_ROOT = previousRuntime;
    rmSync(root, { recursive: true, force: true });
  }
});
