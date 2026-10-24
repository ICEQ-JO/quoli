import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { startCollector } from "../apps/collector/src/server";
import { capacityEvents } from "../fixtures/capacity";
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
    const countsUrl = `${url}/v1/projects/demo-quoli/session-counts`;
    assert.equal((await fetch(countsUrl)).status, 401);
    const counts = await fetch(countsUrl, { headers });
    assert.equal(counts.status, 200);
    const projected = await counts.json();
    assert.equal(projected["session-cache"].kindCounts.gap, 1);
    assert.equal(projected["session-cache"].kindCounts.repository_snapshot, 2);
    assert.equal(JSON.stringify(projected).includes("The usage panel"), false);
    assert.equal(
      (await fetch(`${url}/v1/projects/unknown/session-counts`, { headers })).status,
      404,
    );
    const repeated = await fetch(`${url}/v1/demo`, { method: "POST", headers });
    assert.equal((await repeated.json()).duplicates, 33);
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
    const queryUrl = `${url}/v1/projects/demo-quoli/sessions/session-cache/events/query`;
    const search = await fetch(queryUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        search: "pnpm typecheck",
        kind: "commands",
        order: "source",
        cursor: 0,
      }),
    });
    const found = await search.json();
    assert.equal(found.total, 1);
    assert.equal(found.events[0].toolId, "tool-typecheck");
    assert.equal(
      (
        await fetch(queryUrl, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ search: "x".repeat(201) }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(queryUrl, {
          method: "POST",
          headers: {
            ...headers,
            Origin: "https://attacker.invalid",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    const changesUrl = `${url}/v1/projects/demo-quoli/sessions/session-cache/changes`;
    const comparison = { beforeId: "snap_demo_cache_before", afterId: "snap_demo_cache_after" };
    assert.equal(
      (await fetch(changesUrl, { method: "POST", body: JSON.stringify(comparison) })).status,
      401,
    );
    const changes = await fetch(changesUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(comparison),
    });
    assert.equal(changes.status, 200);
    assert.equal((await changes.json()).files.length, 2);
    assert.equal(
      (
        await fetch(changesUrl, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: " ".repeat(1048577),
        })
      ).status,
      413,
    );
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

test("collector paginates older sessions, validates them directly, and reports capacity rejection", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-capacity-http-"));
  process.env.TRACEFRAME_DATA_DIR = dir;
  const store = new Store(join(dir, "db.sqlite"), { maxEvents: 52, maxBytes: 1048576 });
  store.registerProject("capacity", "Synthetic");
  const events = capacityEvents(51, "wide");
  store.append(events);
  const server = startCollector(0, store);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: `Bearer ${credential()}` };
  try {
    const first = await (
      await fetch(`${url}/v1/projects/capacity/sessions?paged=1`, { headers })
    ).json();
    const legacy = await fetch(`${url}/v1/projects/capacity/sessions`, { headers });
    assert.equal(legacy.headers.get("X-Quoli-Session-Total"), "51");
    assert.equal(legacy.headers.get("X-Quoli-Next-Cursor"), String(first.nextCursor));
    assert.equal((await legacy.json()).length, 50);
    assert.equal(first.total, 51);
    assert.equal(first.sessions.length, 50);
    const last = await (
      await fetch(`${url}/v1/projects/capacity/sessions?paged=1&cursor=${first.nextCursor}`, {
        headers,
      })
    ).json();
    assert.deepEqual(
      last.sessions.map((s: { id: string }) => s.id),
      ["root"],
    );
    assert.equal(last.nextCursor, null);
    for (const resource of ["summary", "events", "snapshots", "repository-history"]) {
      assert.equal(
        (await fetch(`${url}/v1/projects/capacity/sessions/root/${resource}`, { headers })).status,
        200,
      );
    }
    assert.equal(
      (await fetch(`${url}/v1/projects/capacity/sessions?cursor=-1`, { headers })).status,
      400,
    );
    assert.equal(
      (await fetch(`${url}/v1/projects/capacity/session-counts?cursor=1.5`, { headers })).status,
      400,
    );
    const response = await fetch(`${url}/v1/ingest`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        events: events
          .slice(0, 2)
          .map((e, i) => ({ ...e, id: `overflow-${i}`, deliveryId: `overflow-${i}` })),
      }),
    });
    assert.equal(response.status, 507);
    assert.equal((await response.json()).code, "storage_limit");
    assert.equal(store.usage("capacity").events, 51);
    assert.equal((await (await fetch(`${url}/health`, { headers })).json()).capacityRejected, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(dir, { recursive: true, force: true });
  }
});
