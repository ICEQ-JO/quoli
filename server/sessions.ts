import { isAbsolute, relative } from "node:path";
import {
  type AgentNode,
  categorize,
  type FileTouch,
  type SessionDetail,
  type SessionSummary,
  type TokenTotals,
  type ToolCall,
  type Turn,
  zeroTokens,
} from "../shared/model.ts";
import { projectId, type RawEvent, type UsageRow } from "./db.ts";

const LIVE_WINDOW_MS = 10 * 60_000;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Builds the session view from raw hook events and transcript usage. Pure and deterministic. */
export function deriveSession(
  events: RawEvent[],
  usage: UsageRow[],
  now = Date.now(),
): SessionDetail | null {
  const first = events[0];
  if (!first) return null;
  const root = first.root;
  const calls = new Map<string, ToolCall>();
  const agents = new Map<string, AgentNode>([
    ["main", { id: "main", kind: "main", type: null, parentToolUseId: null, tokens: zeroTokens() }],
  ]);
  const turns: Turn[] = [];
  const files: Record<string, FileTouch> = {};
  let endedAt: string | null = null;
  let branch: string | null = null;

  for (const e of events) {
    const p = e.payload;
    const agentId = str(p.agent_id) ?? "main";
    if (agentId !== "main" && !agents.has(agentId)) {
      agents.set(agentId, {
        id: agentId,
        kind: "subagent",
        type: str(p.agent_type),
        parentToolUseId: null,
        tokens: zeroTokens(),
      });
    }
    switch (e.event) {
      case "SessionStart":
        branch = str(p.quoli_branch) ?? branch;
        endedAt = null;
        break;
      case "UserPromptSubmit":
        turns.push({ prompt: str(p.prompt) ?? "", at: e.at, toolCallIds: [] });
        break;
      case "PreToolUse": {
        const id = str(p.tool_use_id) ?? `seq-${e.seq}`;
        const name = str(p.tool_name) ?? "unknown";
        const touched = filesOf(p.tool_input, root);
        const call: ToolCall = {
          id,
          agentId,
          name,
          category: categorize(name),
          startedAt: e.at,
          endedAt: null,
          status: "running",
          summary: summarize(p.tool_input, root),
          files: touched,
          input: p.tool_input ?? null,
          output: null,
        };
        calls.set(id, call);
        turns.at(-1)?.toolCallIds.push(id);
        for (const f of touched) {
          files[f] ??= { read: 0, edited: 0, toolCallIds: [] };
          const t = files[f];
          if (call.category === "edit") t.edited++;
          else t.read++;
          t.toolCallIds.push(id);
        }
        break;
      }
      case "PostToolUse":
      case "PostToolUseFailure": {
        const call = calls.get(str(p.tool_use_id) ?? "");
        if (!call) break;
        call.endedAt = e.at;
        call.output = outputText(p.tool_response ?? p.error);
        call.status =
          e.event === "PostToolUseFailure" || isFailure(p.tool_response) ? "failed" : "ok";
        break;
      }
      case "SubagentStart":
      case "SubagentStop": {
        const a = agents.get(agentId);
        if (a && !a.type) a.type = str(p.agent_type);
        break;
      }
      case "SessionEnd":
        endedAt = e.at;
        break;
    }
  }

  const tokens = zeroTokens();
  const models = new Set<string>();
  for (const u of usage) {
    const t: TokenTotals = {
      input: u.input,
      output: u.output,
      cacheRead: u.cacheRead,
      cacheWrite: u.cacheWrite,
    };
    add(tokens, t);
    add((agents.get(u.agentId) ?? (agents.get("main") as AgentNode)).tokens, t);
    if (u.model) models.add(u.model);
  }

  const toolCalls = [...calls.values()];
  const last = events.at(-1)?.at ?? first.at;
  const title = promptTitle(turns.map((t) => t.prompt)) ?? `Session ${first.sessionId.slice(0, 8)}`;
  return {
    id: first.sessionId,
    projectId: projectId(root),
    root,
    title,
    branch,
    startedAt: first.at,
    endedAt,
    live: !endedAt && now - Date.parse(last) < LIVE_WINDOW_MS,
    toolCount: toolCalls.length,
    filesTouched: Object.keys(files).length,
    failures: toolCalls.filter((c) => c.status === "failed").length,
    tokens,
    models: [...models],
    agents: [...agents.values()],
    turns,
    toolCalls,
    files,
    usage: usage.map((u) => ({
      at: u.at,
      agentId: u.agentId,
      model: u.model,
      tokens: {
        input: u.input,
        output: u.output,
        cacheRead: u.cacheRead,
        cacheWrite: u.cacheWrite,
      },
    })),
  };
}

/** First line of the first prompt with text, without Claude Code image placeholders like "[Image #4]". */
function promptTitle(prompts: string[]): string | null {
  const given = prompts.filter((p) => p.trim());
  if (!given.length) return null;
  for (const p of given) {
    for (const line of p.split("\n")) {
      const clean = line
        .replace(/\[Image #\d+\]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (clean) return clip(clean, 90);
    }
  }
  return "Image prompt";
}

export function summarizeSession(d: SessionDetail): SessionSummary {
  const { agents: _a, turns: _t, toolCalls: _c, files: _f, usage: _u, ...rest } = d;
  return rest;
}

function add(into: TokenTotals, t: TokenTotals) {
  into.input += t.input;
  into.output += t.output;
  into.cacheRead += t.cacheRead;
  into.cacheWrite += t.cacheWrite;
}

function rel(path: string, root: string): string | null {
  const r = isAbsolute(path) ? relative(root, path) : path;
  return r && !r.startsWith("..") && !isAbsolute(r) ? r : null;
}

function filesOf(input: unknown, root: string): string[] {
  if (!input || typeof input !== "object") return [];
  const i = input as Record<string, unknown>;
  const path = str(i.file_path) ?? str(i.notebook_path);
  const r = path ? rel(path, root) : null;
  return r ? [r] : [];
}

function summarize(input: unknown, root: string): string {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const path = str(i.file_path) ?? str(i.notebook_path);
  if (path) return rel(path, root) ?? path;
  if (str(i.command)) return clip(String(i.command).split("\n")[0], 140);
  if (str(i.pattern)) return clip(`${i.pattern}${str(i.path) ? `  in ${i.path}` : ""}`, 140);
  if (str(i.description)) return clip(String(i.description), 140);
  if (str(i.url)) return String(i.url);
  if (str(i.query)) return clip(String(i.query), 140);
  return clip(JSON.stringify(i), 120);
}

function outputText(r: unknown): string | null {
  if (r === undefined || r === null) return null;
  if (typeof r === "string") return clip(r, 20_000);
  if (typeof r === "object") {
    const o = r as Record<string, unknown>;
    if (typeof o.stdout === "string" || typeof o.stderr === "string") {
      return clip([o.stdout, o.stderr].filter(Boolean).join("\n"), 20_000);
    }
  }
  return clip(JSON.stringify(r, null, 2), 20_000);
}

function isFailure(r: unknown): boolean {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return o.is_error === true || o.success === false || o.interrupted === true;
}
