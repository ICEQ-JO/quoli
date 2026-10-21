import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
test("one-command startup preserves evidence across restart and releases both ports", {
  timeout: 60000,
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-lifecycle-"));
  const collectorPort = await freePort(),
    webPort = await freePort();
  const env = {
    ...process.env,
    TRACEFRAME_DATA_DIR: dir,
    TRACEFRAME_COLLECTOR_PORT: String(collectorPort),
    TRACEFRAME_WEB_PORT: String(webPort),
    TRACEFRAME_NEXT_DIR: ".next-lifecycle",
  };
  let running: ChildProcess | undefined;
  let logs = "";
  async function start() {
    running = spawn(process.execPath, ["--import", "tsx", "scripts/dev.ts", "--demo"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    running.stdout?.on("data", (chunk) => {
      logs += chunk.toString();
    });
    running.stderr?.on("data", (chunk) => {
      logs += chunk.toString();
    });
    for (let i = 0; i < 120; i++) {
      assert.equal(running.exitCode, null, logs);
      try {
        if (
          (
            await fetch(`http://127.0.0.1:${webPort}/api/health`, {
              signal: AbortSignal.timeout(500),
            })
          ).ok
        )
          return;
      } catch {}
      await delay(100);
    }
    assert.fail(`Startup timed out: ${logs}`);
  }
  async function stop() {
    if (!running || running.exitCode !== null) return;
    const exited = once(running, "exit");
    running.kill("SIGTERM");
    await exited;
    running = undefined;
    for (const port of [collectorPort, webPort])
      await assert.rejects(
        fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) }),
      );
  }
  try {
    await start();
    const token = readFileSync(join(dir, "credential"), "utf8").trim();
    const request = () =>
      fetch(
        `http://127.0.0.1:${collectorPort}/v1/projects/demo-quoli/sessions/session-cache/events`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    assert.equal((await (await request()).json()).total, 17);
    const conflict = spawn(process.execPath, ["--import", "tsx", "scripts/dev.ts", "--demo"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let message = "";
    conflict.stderr?.on("data", (chunk) => {
      message += chunk.toString();
    });
    const [code] = await once(conflict, "exit");
    assert.equal(code, 1);
    assert.match(message, /busy/);
    await stop();
    await start();
    assert.equal((await (await request()).json()).total, 17);
    assert.match(logs, /29 already present/);
  } finally {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
