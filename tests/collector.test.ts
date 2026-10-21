import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { startCollector } from "../apps/collector/src/server";
import { Store } from "../packages/storage/src/index";
import { credential, rotateCredential } from "../packages/storage/src/runtime";

test("collector enforces auth, origins, atomic bounded input, replay and rotation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-http-"));
  process.env.TRACEFRAME_DATA_DIR = dir;
  const server = startCollector(0, new Store(join(dir, "db.sqlite")));
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: `Bearer ${credential()}` };
  try {
    assert.equal((await fetch(`${url}/health`, {})).status, 401);
    assert.equal(
      await new Promise<number | undefined>((resolve, reject) => {
        const req = request(
          `${url}/health`,
          { headers: { ...headers, Host: "attacker.invalid" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.once("error", reject);
        req.end();
      }),
      403,
    );
    assert.equal(
      (
        await fetch(`${url}/health`, {
          headers: { ...headers, Origin: "https://attacker.invalid" },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(`${url}/v1/demo`, { method: "POST", headers })).status, 200);
    const repeated = await fetch(`${url}/v1/demo`, { method: "POST", headers });
    assert.equal((await repeated.json()).duplicates, 29);
    assert.equal(
      (
        await fetch(`${url}/v1/ingest`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: '{"events":[{"schemaVersion":99}]}',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${url}/v1/ingest`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: '{"broken":',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${url}/v1/ingest`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: " ".repeat(1048577),
        })
      ).status,
      413,
    );
    assert.equal(
      (
        await fetch(`${url}/v1/projects/demo-quoli/sessions/session-cache/events?cursor=-1`, {
          headers,
        })
      ).status,
      400,
    );
    const page = await fetch(`${url}/v1/projects/demo-quoli/sessions/session-cache/events`, {
      headers,
    });
    assert.equal((await page.json()).events.length, 8);
    rotateCredential();
    assert.equal((await fetch(`${url}/health`, { headers })).status, 401);
    assert.equal(
      (
        await fetch(`${url}/health`, {
          headers: { ...headers, Authorization: `Bearer ${credential()}` },
        })
      ).status,
      200,
    );
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TRACEFRAME_DATA_DIR;
  }
});
