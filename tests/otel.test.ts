import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { otlpUsageEvents, readOtlpBody } from "../apps/collector/src/otel";
import { startCollector } from "../apps/collector/src/server";
import { claudeOtlpSamples } from "../fixtures/claude";
import { usage } from "../packages/analysis/src/index";
import { Store } from "../packages/storage/src/index";
import { credential } from "../packages/storage/src/runtime";

const projectId = "repo_otel_probe";

function otlpBody(attributes: Record<string, string | number>) {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "claude-code" } },
            { key: "service.version", value: { stringValue: "2.1.306" } },
          ],
        },
        scopeLogs: [
          {
            logRecords: [
              {
                timeUnixNano: "1760000000000000000",
                body: { stringValue: "claude_code.api_request" },
                attributes: Object.entries(attributes).map(([key, value]) => ({
                  key,
                  value: typeof value === "number" ? { intValue: value } : { stringValue: value },
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}

test("reported request usage becomes one usage observation and drops personal attributes", () => {
  const body = otlpBody({
    "event.name": "api_request",
    "session.id": "11111111-1111-4111-8111-111111111111",
    "prompt.id": "22222222-2222-4222-8222-222222222222",
    request_id: "req_probe_0001",
    model: "claude-opus-5-5",
    input_tokens: 2,
    output_tokens: 84,
    cache_read_tokens: 10648,
    cache_creation_tokens: 23468,
    "event.sequence": 59,
    "user.email": "person@example.invalid",
    "user.id": "personal-id",
    "organization.id": "org-id",
  });
  const events = otlpUsageEvents(body, projectId);
  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.source, "claude_otel");
  assert.equal(event.requestId, "req_probe_0001");
  assert.equal(event.sessionId, "11111111-1111-4111-8111-111111111111");
  assert.equal(event.promptId, "22222222-2222-4222-8222-222222222222");
  assert.equal(event.sourceTime, new Date(1760000000000).toISOString());
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes("person@example.invalid"), false);
  assert.equal(serialized.includes("personal-id"), false);
  assert.equal(serialized.includes("org-id"), false);
  assert.equal(event.payload.kind, "usage");
  if (event.payload.kind === "usage") {
    assert.equal(event.payload.input, 2);
    assert.equal(event.payload.output, 84);
    assert.equal(event.payload.cacheRead, 10648);
    assert.equal(event.payload.cacheWrite, 23468);
    assert.equal(event.payload.temporality, "request_delta");
  }
});

test("records that are not reported request usage are ignored", () => {
  const samples = claudeOtlpSamples().filter(
    (sample) => sample.attributes["event.name"] !== "api_request",
  );
  const body = {
    resourceLogs: [
      {
        scopeLogs: [
          {
            logRecords: samples.map((sample) => ({
              timeUnixNano: "1760000000000000000",
              body: { stringValue: sample.body },
              attributes: Object.entries(sample.attributes).map(([key, value]) => ({
                key,
                value:
                  typeof value === "number" ? { intValue: value } : { stringValue: String(value) },
              })),
            })),
          },
        ],
      },
    ],
  };
  assert.deepEqual(otlpUsageEvents(body, projectId), []);
  // A record without a request identity is kept with null counts so the gap stays visible.
  const unidentified = otlpUsageEvents(
    otlpBody({
      "event.name": "api_request",
      "session.id": "11111111-1111-4111-8111-111111111111",
      model: "claude-opus-5-5",
      input_tokens: 4,
    }),
    projectId,
  );
  assert.equal(unidentified.length, 1);
  assert.equal(unidentified[0].requestId, null);
  // A record without a session identity cannot be attributed and is not stored.
  assert.deepEqual(
    otlpUsageEvents(otlpBody({ "event.name": "api_request", request_id: "req_x" }), projectId),
    [],
  );
  assert.equal(readOtlpBody("not json"), null);
});

test("the local receiver stores reported usage and rejects anything else", async () => {
  const dir = mkdtempSync(join(tmpdir(), "traceframe-otel-"));
  const previous = process.env.TRACEFRAME_DATA_DIR;
  const previousProject = process.env.TRACEFRAME_PROJECT_ID;
  process.env.TRACEFRAME_DATA_DIR = dir;
  process.env.TRACEFRAME_PROJECT_ID = projectId;
  const store = new Store(join(dir, "db.sqlite"));
  store.registerProject(projectId, "probe", false);
  const server = startCollector(0, store);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: `Bearer ${credential()}`, "Content-Type": "application/json" };
  try {
    assert.equal(
      (
        await fetch(`${url}/v1/logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${url}/v1/logs`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-protobuf" },
          body: "{}",
        })
      ).status,
      415,
    );
    const body = otlpBody({
      "event.name": "api_request",
      "session.id": "11111111-1111-4111-8111-111111111111",
      request_id: "req_probe_0002",
      model: "claude-opus-5-5",
      input_tokens: 3,
      output_tokens: 10,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
    });
    const response = await fetch(`${url}/v1/logs`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    const events = store.allEvents(projectId, "11111111-1111-4111-8111-111111111111");
    assert.equal(events.length, 1);
    const view = usage(events);
    assert.equal(view.input, 3);
    assert.equal(view.output, 10);
    assert.equal(view.requests, 1);
    // A repeated export of the same request is a duplicate, not a second total.
    await fetch(`${url}/v1/logs`, { method: "POST", headers, body: JSON.stringify(body) });
    assert.equal(store.allEvents(projectId, "11111111-1111-4111-8111-111111111111").length, 1);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    if (previous === undefined) delete process.env.TRACEFRAME_DATA_DIR;
    else process.env.TRACEFRAME_DATA_DIR = previous;
    if (previousProject === undefined) delete process.env.TRACEFRAME_PROJECT_ID;
    else process.env.TRACEFRAME_PROJECT_ID = previousProject;
    rmSync(dir, { recursive: true, force: true });
  }
});
