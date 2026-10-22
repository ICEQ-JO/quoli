import type { CapturePolicy, Content, NormalizedEvent } from "../packages/schema/src/index";

export const demoPolicy: CapturePolicy = {
  version: 1,
  prompt: true,
  tool: true,
  code: true,
  maxFieldBytes: 65536,
  excludedPaths: [".env", ".git", "node_modules", "secrets", "credentials"],
};
export function demoEvents(): NormalizedEvent[] {
  let index = 0;
  const content = (
    text: string | null,
    categories: Content["categories"] = ["tool", "code"],
    state: Content["state"] = "present",
  ): Content => ({ text, state, originalBytes: null, categories });
  function event(
    sessionId: string,
    payload: NormalizedEvent["payload"],
    extras: Partial<NormalizedEvent> = {},
  ): NormalizedEvent {
    const n = ++index;
    return {
      schemaVersion: 1,
      id: `demo-${n}`,
      deliveryId: `demo-delivery-${n}`,
      projectId: "demo-quoli",
      sessionId,
      source: "synthetic",
      adapterVersion: "0.1.0",
      sourceLocator: `fixtures/demo.ts#demo-${n}`,
      producerId: "fixture-v1",
      promptId: null,
      toolId: null,
      requestId: null,
      sourceTime: new Date(Date.UTC(2026, 9, 22, 9, 0, n * 12)).toISOString(),
      sourceSequence: n,
      policyVersion: 1,
      payload,
      ...extras,
    };
  }
  const older = [
    event("session-interrupted", {
      kind: "session_start",
      content: content("Investigate a slow repository scan", ["prompt"]),
    }),
    event(
      "session-interrupted",
      {
        kind: "prompt",
        content: content("Find why the repository scan takes too long.", ["prompt"]),
      },
      { promptId: "prompt-scan" },
    ),
    event(
      "session-interrupted",
      {
        kind: "tool_call",
        toolName: "Bash",
        content: content("pnpm test --filter repository"),
        path: null,
      },
      { toolId: "tool-scan", promptId: "prompt-scan" },
    ),
    event("session-interrupted", { kind: "gap", reason: "missing_result" }),
    event(
      "session-interrupted",
      {
        kind: "usage",
        input: 900,
        output: null,
        cacheRead: null,
        cacheWrite: 0,
        model: "synthetic-model",
        temporality: "request_delta",
      },
      { requestId: "request-scan" },
    ),
    event("session-interrupted", { kind: "gap", reason: "missing_end" }),
  ];
  const metadata = [
    event("session-metadata", {
      kind: "session_start",
      content: content(null, ["prompt"], "disabled"),
    }),
    event(
      "session-metadata",
      { kind: "prompt", content: content(null, ["prompt"], "disabled") },
      { promptId: "prompt-private" },
    ),
    event(
      "session-metadata",
      {
        kind: "tool_call",
        toolName: "Read",
        content: content(null, ["tool", "code"], "disabled"),
        path: null,
      },
      { toolId: "tool-private" },
    ),
    event(
      "session-metadata",
      {
        kind: "tool_result",
        toolName: "Read",
        content: content(null, ["tool", "code"], "disabled"),
        status: "success",
        exitCode: null,
      },
      { toolId: "tool-private" },
    ),
    event("session-metadata", { kind: "gap", reason: "capture_disabled" }),
    event("session-metadata", { kind: "session_end", reason: "completed" }),
  ];
  const session = "session-cache";
  const main = [
    event(session, {
      kind: "session_start",
      content: content("Handle an empty cache response", ["prompt"]),
    }),
    event(
      session,
      {
        kind: "prompt",
        content: content(
          "The usage panel crashes when cache_read_tokens is missing. Keep missing values unknown and add a regression test.",
          ["prompt"],
        ),
      },
      { promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "tool_call",
        toolName: "Read",
        content: content("Read src/usage/normalize.ts"),
        path: "src/usage/normalize.ts",
      },
      { toolId: "tool-read", promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "tool_result",
        toolName: "Read",
        content: content(
          "export function cacheRead(usage) {\n  return usage.cache_read_tokens.toLocaleString();\n}",
        ),
        status: "success",
        exitCode: null,
      },
      { toolId: "tool-read", promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "usage",
        input: 1840,
        output: 620,
        cacheRead: 12200,
        cacheWrite: 2400,
        model: "synthetic-model",
        temporality: "request_delta",
      },
      { requestId: "request-cache-1", promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "tool_call",
        toolName: "Edit",
        content: content(
          "src/usage/normalize.ts\n\nexport function cacheRead(usage) {\n  return usage.cache_read_tokens ?? null;\n}\n\n// A missing count is not zero.",
        ),
        path: "src/usage/normalize.ts",
      },
      { toolId: "tool-edit", promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "tool_result",
        toolName: "Edit",
        content: content(
          "Edit tool reported a successful update. No repository snapshot is attached to this observation.",
        ),
        status: "success",
        exitCode: null,
      },
      { toolId: "tool-edit", promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "tool_call",
        toolName: "Bash",
        content: content("pnpm test --filter usage"),
        path: null,
      },
      { toolId: "tool-test-fail", promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "tool_result",
        toolName: "Bash",
        content: content(
          "FAIL usage.test.ts\n  × preserves unknown cache usage\n  Expected null, received 0\n\nTests: 1 failed, 4 passed",
        ),
        status: "failure",
        exitCode: 1,
      },
      { toolId: "tool-test-fail", promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "tool_call",
        toolName: "Edit",
        content: content("Update the regression fixture: expect null for missing cache usage."),
        path: "src/usage/usage.test.ts",
      },
      { toolId: "tool-fix-test", promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "tool_result",
        toolName: "Edit",
        content: content("Regression fixture updated."),
        status: "success",
        exitCode: null,
      },
      { toolId: "tool-fix-test", promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "tool_call",
        toolName: "Bash",
        content: content("pnpm test --filter usage"),
        path: null,
      },
      { toolId: "tool-test-pass", promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "tool_result",
        toolName: "Bash",
        content: content(
          "PASS usage.test.ts\n  ✓ preserves unknown cache usage\n  ✓ keeps recorded zero\n\nTests: 5 passed\n\nThis is a synthetic command result, not evidence about Traceframe itself.",
        ),
        status: "success",
        exitCode: 0,
      },
      { toolId: "tool-test-pass", promptId: "prompt-cache" },
    ),
    event(
      session,
      {
        kind: "usage",
        input: 1260,
        output: 940,
        cacheRead: 18300,
        cacheWrite: 0,
        model: "synthetic-model",
        temporality: "request_delta",
      },
      { requestId: "request-cache-2", promptId: "prompt-cache" },
    ),
    event(
      session,
      { kind: "tool_call", toolName: "Bash", content: content("pnpm typecheck"), path: null },
      { toolId: "tool-typecheck", promptId: "prompt-cache" },
    ),
    event(session, { kind: "gap", reason: "missing_result" }),
    event(session, { kind: "session_end", reason: "completed" }),
  ];
  // Receipt order is deliberately different from source order for one result.
  const delayed = main.splice(8, 1)[0];
  main.splice(10, 0, delayed);
  return [...older, ...metadata, ...main];
}
