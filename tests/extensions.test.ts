import assert from "node:assert/strict";
import { test } from "node:test";
import { extensionOf, parseMcpName, sessionExtensions } from "../server/extensions.ts";
import { insightsReport } from "../server/insights.ts";
import type { SessionDetail, ToolCall } from "../shared/model.ts";

let n = 0;
const call = (
  name: string,
  input: Record<string, unknown> = {},
  o: Partial<ToolCall> = {},
): ToolCall => ({
  id: `c${n++}`,
  agentId: "main",
  name,
  category: "other",
  startedAt: "2026-11-12T10:00:00.000Z",
  endedAt: "2026-11-12T10:00:01.000Z",
  status: "ok",
  summary: "",
  files: [],
  input,
  output: null,
  ...o,
});

test("MCP names split into server and tool, the documented way", () => {
  assert.deepEqual(parseMcpName("mcp__github__search_repositories"), {
    server: "github",
    tool: "search_repositories",
  });
  assert.deepEqual(parseMcpName("mcp__plugin_my-plugin_db__query"), {
    server: "plugin_my-plugin_db",
    tool: "query",
  });
  assert.equal(parseMcpName("Bash"), null);
  assert.equal(parseMcpName("context7_resolve_library_id"), null); // OpenCode: not attributed
});

test("the reported mcp_server wins, and a plugin is named only when the agent says so", () => {
  assert.deepEqual(extensionOf(call("mcp__plugin_my-plugin_db__query")), {
    kind: "mcp",
    name: "plugin_my-plugin_db",
    plugin: null,
    tool: "query",
  });
  assert.deepEqual(
    extensionOf(
      call(
        "mcp__plugin_my-plugin_db__query",
        {},
        {
          mcpServer: { name: "plugin:my-plugin:db", source: "plugin" },
        },
      ),
    ),
    { kind: "mcp", name: "db", plugin: "my-plugin", tool: "query" },
  );
  // A user-scoped server whose name merely looks scoped is taken as is.
  assert.equal(
    extensionOf(call("mcp__x__t", {}, { mcpServer: { name: "plugin:a:b", source: "user" } }))
      ?.plugin,
    null,
  );
});

test("skills and subagent types come from the Skill and Agent tool inputs", () => {
  assert.deepEqual(extensionOf(call("Skill", { skill: "deploy" })), {
    kind: "skill",
    name: "deploy",
    plugin: null,
    tool: null,
  });
  assert.equal(extensionOf(call("Skill", { skill: "acme:review" }))?.plugin, "acme");
  assert.equal(extensionOf(call("Skill", {})), null);
  assert.equal(extensionOf(call("Agent", { subagent_type: "Explore" }))?.name, "Explore");
  assert.equal(extensionOf(call("Task", {}))?.name, "default");
  assert.equal(extensionOf(call("Read", { file_path: "/a" })), null);
});

test("a session's extensions count calls, failures and tools, MCP first", () => {
  const ext = sessionExtensions([
    call("Agent", { subagent_type: "Explore" }),
    call("mcp__github__get_issue"),
    call("mcp__github__search", {}, { status: "failed" }),
    call("mcp__github__get_issue"),
    call("Skill", { skill: "deploy" }),
  ]);
  assert.deepEqual(
    ext.map((e) => [e.kind, e.name, e.calls, e.failures, e.tools]),
    [
      ["mcp", "github", 3, 1, ["get_issue", "search"]],
      ["skill", "deploy", 1, 0, []],
      ["subagent", "Explore", 1, 0, []],
    ],
  );
  assert.equal(ext[0].toolCallIds.length, 3);
});

test("Insights totals extensions across sessions", () => {
  const session = (calls: ToolCall[]) =>
    ({
      id: `s${n++}`,
      agent: "claude-code",
      projectId: "p",
      startedAt: new Date().toISOString(),
      endedAt: null,
      live: true,
      failures: 0,
      loops: 0,
      models: [],
      cost: { usd: null, unpriced: [] },
      turns: [],
      usage: [],
      toolCalls: calls,
      report: { extensions: sessionExtensions(calls) },
    }) as unknown as SessionDetail;
  const r = insightsReport(
    [
      session([call("mcp__github__a"), call("mcp__github__b", {}, { status: "failed" })]),
      session([call("mcp__github__a"), call("Skill", { skill: "deploy" })]),
    ],
    1,
  );
  assert.deepEqual(
    r.extensions.map((e) => [e.name, e.sessions, e.calls, e.failures]),
    [
      ["github", 2, 3, 1],
      ["deploy", 1, 1, 0],
    ],
  );
});
