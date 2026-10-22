import assert from "node:assert/strict";
import { test } from "node:test";
import { demoEvents } from "../fixtures/demo";
import { parseTestOutput, verification } from "../packages/analysis/src/checks";
import { checkObservationSchema, verificationViewSchema } from "../packages/schema/src/checks";
import { relationshipSchema, type StoredEvent } from "../packages/schema/src/index";

const stored = (events = demoEvents()): StoredEvent[] =>
  events.map((e, i) => ({ ...e, sequence: i + 1, receivedAt: "2026-10-22T10:00:00.000Z" }));

let clock = 0;
function event(
  id: string,
  sessionId: string,
  payload: StoredEvent["payload"],
  extras: Partial<StoredEvent> = {},
): StoredEvent {
  // Creation order is source order, so the projection sees a stable timeline.
  clock += 1;
  return {
    schemaVersion: 1,
    id,
    deliveryId: `${id}-delivery`,
    projectId: "demo-quoli",
    sessionId,
    source: "synthetic",
    adapterVersion: "0.1.0",
    sourceLocator: null,
    producerId: "fixture-v1",
    promptId: null,
    toolId: null,
    requestId: null,
    sourceTime: new Date(Date.UTC(2026, 9, 22, 9, 0, clock)).toISOString(),
    sourceSequence: null,
    policyVersion: 1,
    payload,
    sequence: clock,
    receivedAt: "2026-10-22T10:00:00.000Z",
    ...extras,
  };
}
/** A command request and its result share one explicit tool ID. */
function command(
  id: string,
  sessionId: string,
  toolId: string,
  command: string,
  result?: { text: string | null; exitCode: number | null; status: "success" | "failure" },
) {
  const call = event(
    `${id}-call`,
    sessionId,
    { kind: "tool_call", toolName: "Bash", content: content(command), path: null },
    { toolId },
  );
  if (!result) return [call];
  return [
    call,
    event(
      `${id}-result`,
      sessionId,
      {
        kind: "tool_result",
        toolName: "Bash",
        content: content(result.text),
        exitCode: result.exitCode,
        status: result.status,
      },
      { toolId },
    ),
  ];
}
const content = (text: string | null) => ({
  text,
  state: "present" as const,
  originalBytes: null,
  categories: ["tool" as const, "code" as const],
});

test("the fixture parser reports counts only for the supported output format", () => {
  const failing = parseTestOutput(
    "FAIL usage.test.ts\n  × preserves unknown cache usage\n\nTests: 1 failed, 4 passed",
  );
  assert.equal(failing.supported, true);
  assert.equal(failing.failed, 1);
  assert.equal(failing.passed, 4);
  assert.equal(failing.total, 5);
  assert.equal(failing.failure, true);
  const passing = parseTestOutput("PASS usage.test.ts\n  ✓ keeps recorded zero\n\nTests: 5 passed");
  assert.equal(passing.passed, 5);
  assert.equal(passing.failed, 0);
  assert.equal(passing.total, 5);
  assert.equal(passing.failure, false);
  const unsupported = parseTestOutput("Everything up to date");
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.passed, null);
  assert.equal(unsupported.failed, null);
  assert.equal(unsupported.total, null);
  assert.equal(unsupported.failure, false);
  assert.equal(parseTestOutput(null).supported, false);
});

test("recorded checks keep command, result, exit code and counts as independent facts", () => {
  const rows = stored().filter((e) => e.sessionId === "session-cache");
  const view = verification(rows);
  verificationViewSchema.parse(view);
  const resultId = (toolId: string) =>
    rows.find((e) => e.payload.kind === "tool_result" && e.toolId === toolId)?.id;
  const callId = (toolId: string) =>
    rows.find((e) => e.payload.kind === "tool_call" && e.toolId === toolId)?.id;
  const failed = view.checks.find((c) => c.resultId === resultId("tool-test-fail"));
  assert.ok(failed);
  assert.equal(failed.state, "failed");
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.counts.failed, 1);
  assert.equal(failed.counts.passed, 4);
  assert.equal(failed.commandObserved, true);
  const passed = view.checks.find((c) => c.resultId === resultId("tool-test-pass"));
  assert.ok(passed);
  assert.equal(passed.state, "passed");
  assert.equal(passed.exitCode, 0);
  assert.equal(passed.counts.total, 5);
  const missing = view.checks.find((c) => c.callId === callId("tool-typecheck"));
  assert.ok(missing);
  assert.equal(missing.state, "missing_result");
  assert.equal(missing.resultObserved, false);
  assert.equal(missing.exitCode, null);
  assert.equal(missing.counts.passed, null);
});

test("an exit-zero result with failing assertions is not reported as a pass", () => {
  const view = verification(
    command("t1", "s1", "tool-1", "pnpm test", {
      text: "FAIL usage.test.ts\n  × breaks\n\nTests: 1 failed, 4 passed",
      exitCode: 0,
      status: "success",
    }),
  );
  assert.equal(view.checks.length, 1);
  assert.equal(view.checks[0].state, "failed");
  assert.equal(view.checks[0].counts.failure, true);
  assert.ok(view.checks[0].uncertainty.includes("does not show which behaviour failed"));
});

test("unsupported output and a missing result stay unknown instead of claiming a pass", () => {
  const unsupported = verification(
    command("u1", "s1", "tool-1", "pnpm typecheck", {
      text: "Done in 4.2s",
      exitCode: 0,
      status: "success",
    }),
  ).checks[0];
  assert.equal(unsupported.state, "unknown_output");
  assert.equal(unsupported.counts.supported, false);
  assert.equal(unsupported.counts.total, null);
  const orphan = verification(command("u2", "s2", "tool-2", "pnpm typecheck")).checks[0];
  assert.equal(orphan.state, "missing_result");
  assert.equal(orphan.resultId, null);
  assert.equal(orphan.exitCode, null);
});

test("paths referenced after a check mark it stale and stay separate from authorship", () => {
  const read = event(
    "f1",
    "s1",
    {
      kind: "tool_call",
      toolName: "Read",
      content: content("Read src/a.ts"),
      path: "src/a.ts",
    },
    { toolId: "tool-read" },
  );
  const [call, result] = command("c1", "s1", "tool-test", "pnpm test", {
    text: "PASS a.test.ts\n\nTests: 2 passed",
    exitCode: 0,
    status: "success",
  });
  const edit = event(
    "f2",
    "s1",
    {
      kind: "tool_call",
      toolName: "Edit",
      content: content("Update src/a.ts"),
      path: "src/a.ts",
    },
    { toolId: "tool-edit" },
  );
  const view = verification([read, call, result, edit]);
  const check = view.checks[0];
  assert.equal(check.state, "passed");
  assert.equal(check.stale, true);
  assert.deepEqual(
    check.files.map((f) => [f.path, f.position]),
    [
      ["src/a.ts", "before"],
      ["src/a.ts", "after"],
    ],
  );
  assert.ok(check.uncertainty.includes("referenced after"));
  const rules = view.relations.map((r) => r.rule);
  assert.ok(rules.includes("prior-file-reference/v1"));
  assert.ok(rules.includes("post-check-file-reference/v1"));
  for (const relation of view.relations) {
    relationshipSchema.parse(relation);
    assert.ok(relation.uncertainty.length > 0);
    assert.ok(relation.evidenceIds.length > 0);
  }
  assert.ok(
    view.relations.every(
      (r) => !r.uncertainty.includes("wrote") && !r.uncertainty.includes("authored"),
    ),
  );
});

test("a missing baseline and a dirty capture window stay ambiguous", () => {
  const snapshot = event("s1", "s1", {
    kind: "repository_snapshot",
    snapshotId: "snap-1",
    reason: "baseline",
    state: "observed",
    dirty: true,
  });
  const [call, result] = command("c1", "s1", "tool-test", "pnpm test", {
    text: "PASS a.test.ts\n\nTests: 2 passed",
    exitCode: 0,
    status: "success",
  });
  const dirty = verification([snapshot, call, result]).checks[0];
  assert.equal(dirty.window.before, "s1");
  assert.equal(dirty.window.dirty, true);
  assert.ok(dirty.uncertainty.includes("dirty working tree"));

  const [unboundCall, unboundResult] = command("c2", "s2", "tool-test-2", "pnpm test", {
    text: "PASS a.test.ts\n\nTests: 2 passed",
    exitCode: 0,
    status: "success",
  });
  const unbounded = verification([unboundCall, unboundResult]).checks[0];
  assert.equal(unbounded.window.before, null);
  assert.equal(unbounded.window.after, null);
  assert.ok(unbounded.uncertainty.includes("No repository capture bounds this check"));
});

test("results from another session never join a check, and rebuilding changes nothing", () => {
  const rows = stored().filter((e) => e.sessionId === "session-cache");
  const call = rows.find((e) => e.payload.kind === "tool_call" && e.toolId === "tool-test-fail");
  assert.ok(call);
  const own = rows.find((e) => e.payload.kind === "tool_result" && e.toolId === "tool-test-fail");
  assert.ok(own);
  const foreign = { ...own, id: "foreign-result", sessionId: "other-session" };
  const withoutOwn = rows.filter((e) => e.id !== own.id);
  const view = verification([...withoutOwn, foreign]);
  const check = view.checks.find((c) => c.callId === call.id);
  assert.ok(check);
  assert.equal(check.resultObserved, false);
  assert.equal(check.state, "missing_result");
  const before = JSON.stringify(rows);
  const first = verification(rows);
  const second = verification(rows);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(rows), before);
});

test("every emitted check carries a versioned rule and independent nullable facts", () => {
  const view = verification(stored());
  for (const check of view.checks) {
    checkObservationSchema.parse(check);
    assert.equal(check.rule, "recorded-command-check/v1");
    assert.ok(check.uncertainty.length > 0);
    assert.ok(check.evidenceIds.length > 0);
    assert.equal(typeof check.commandObserved, "boolean");
    assert.equal(typeof check.resultObserved, "boolean");
  }
  assert.ok(view.uncertainty.includes("does not establish feature correctness"));
});
