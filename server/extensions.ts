import type { Extension, ToolCall } from "../shared/model.ts";

/**
 * MCP servers, skills and subagent types a session called (#135), from recorded tool calls.
 * Contracts:
 * - MCP: Claude Code and Codex name MCP tools `mcp__<server>__<tool>`. Claude Code 2.1.274+ also
 *   sends `mcp_server` { name, source }, with plugin servers named `plugin:<plugin>:<server>`.
 * - Skills: Claude Code's `Skill` tool, whose input names the skill in `skill`; plugin skills are
 *   namespaced `<plugin>:<skill>`.
 * - Subagents: `subagent_type` on Claude Code's `Agent` tool (`Task` in older versions).
 * OpenCode names MCP tools `<server>_<tool>`, which cannot be split reliably, so those calls are
 * not attributed.
 */
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const inputOf = (c: ToolCall) =>
  (c.input && typeof c.input === "object" ? c.input : {}) as Record<string, unknown>;

/** Server and tool from an `mcp__<server>__<tool>` name; null for any other name. */
export function parseMcpName(name: string): { server: string; tool: string } | null {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return m ? { server: m[1], tool: m[2] } : null;
}

type Key = Pick<Extension, "kind" | "name" | "plugin">;

/** Which extension a call belongs to, if any, and the tool it used. */
export function extensionOf(c: ToolCall): (Key & { tool: string | null }) | null {
  const mcp = parseMcpName(c.name);
  if (mcp) {
    const reported = c.mcpServer;
    const scoped =
      reported?.source === "plugin" ? /^plugin:([^:]+):(.+)$/.exec(reported.name) : null;
    return {
      kind: "mcp",
      name: scoped ? scoped[2] : (reported?.name ?? mcp.server),
      plugin: scoped ? scoped[1] : null,
      tool: mcp.tool,
    };
  }
  if (c.name === "Skill") {
    const skill = str(inputOf(c).skill);
    if (!skill) return null;
    const at = skill.indexOf(":");
    return at > 0
      ? { kind: "skill", name: skill.slice(at + 1), plugin: skill.slice(0, at), tool: null }
      : { kind: "skill", name: skill, plugin: null, tool: null };
  }
  if (c.name === "Agent" || c.name === "Task") {
    const type = str(inputOf(c).subagent_type);
    return { kind: "subagent", name: type ?? "default", plugin: null, tool: null };
  }
  return null;
}

const ORDER: Extension["kind"][] = ["mcp", "skill", "subagent"];

/** Every extension the session used, MCP servers first, then by calls. */
export function sessionExtensions(calls: ToolCall[]): Extension[] {
  const out = new Map<string, Extension>();
  for (const c of calls) {
    const e = extensionOf(c);
    if (!e) continue;
    const key = `${e.kind}\0${e.plugin ?? ""}\0${e.name}`;
    let x = out.get(key);
    if (!x) {
      x = {
        kind: e.kind,
        name: e.name,
        plugin: e.plugin,
        calls: 0,
        failures: 0,
        tools: [],
        toolCallIds: [],
      };
      out.set(key, x);
    }
    x.calls++;
    if (c.status === "failed") x.failures++;
    if (e.tool && !x.tools.includes(e.tool)) x.tools.push(e.tool);
    x.toolCallIds.push(c.id);
  }
  return [...out.values()].sort(
    (a, b) =>
      ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) ||
      b.calls - a.calls ||
      a.name.localeCompare(b.name),
  );
}
