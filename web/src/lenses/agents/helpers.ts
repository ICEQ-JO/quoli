import type { ToolCall } from "../../../../shared/model.ts";

/** Runs shorter than this stay as individual rows. */
export const MIN_RUN = 3;

/**
 * Group consecutive calls of the same agent, tool and category. Failed and
 * subagent-launch calls never join a run: they must stay individually visible.
 */
export function collapseRuns(calls: ToolCall[], minRun = MIN_RUN): ToolCall[][] {
  const groups: ToolCall[][] = [];
  const same = (a: ToolCall, b: ToolCall) =>
    a.agentId === b.agentId && a.name === b.name && a.category === b.category;
  const joinable = (c: ToolCall) => c.status !== "failed" && c.category !== "agent";
  let run: ToolCall[] = [];
  const flush = () => {
    if (run.length >= minRun) groups.push(run);
    else for (const c of run) groups.push([c]);
    run = [];
  };
  for (const c of calls) {
    const head = run[0];
    if (head && joinable(c) && same(head, c)) {
      run.push(c);
    } else {
      flush();
      if (joinable(c)) run = [c];
      else groups.push([c]);
    }
  }
  flush();
  return groups;
}

/** Longest shared directory prefix of repo-relative paths ("" when there is none). */
export function commonPrefix(paths: string[]): string {
  const first = paths[0]?.split("/").slice(0, -1);
  if (!first) return "";
  let n = first.length;
  for (const p of paths) {
    const s = p.split("/").slice(0, -1);
    let i = 0;
    while (i < n && i < s.length && s[i] === first[i]) i++;
    n = i;
  }
  return first.slice(0, n).join("/");
}

/** "Read × 14 · packages/admin/src/…" */
export function runLabel(run: ToolCall[]): string {
  const name = (run[0]?.name ?? "").replace(/^mcp__/, "");
  const files = run.flatMap((c) => c.files);
  const prefix = files.length === run.length ? commonPrefix(files) : "";
  return `${name} × ${run.length}${prefix ? ` · ${prefix}/…` : ""}`;
}

/** The Graph view fits everything when small, else only the most recent calls. */
export const GRAPH_FIT_ALL = 25;
export const GRAPH_RECENT = 8;

export type CallFilter = "all" | "failed" | "edits" | "commands" | "subagents";

/** Which calls each filter keeps. */
export function matchesFilter(call: ToolCall, filter: CallFilter, mainId: string): boolean {
  switch (filter) {
    case "failed":
      return call.status === "failed";
    case "edits":
      return call.category === "edit";
    case "commands":
      return call.category === "run";
    case "subagents":
      return call.category === "agent" || call.agentId !== mainId;
    default:
      return true;
  }
}

/**
 * The subagents filter counts calls (each spawn plus every call a subagent made), not agents
 * (#38): one subagent with a spawn and three calls is 1 agent and 4 calls.
 */
export function subagentUnits(
  agents: { id: string; kind: string }[],
  calls: ToolCall[],
  mainId: string,
): { agents: number; calls: number } {
  return {
    agents: agents.filter((a) => a.kind === "subagent").length,
    calls: calls.filter((c) => matchesFilter(c, "subagents", mainId)).length,
  };
}

const tag = (text: string, name: string) =>
  text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? null;

export type PromptView =
  | { kind: "user"; text: string }
  | { kind: "notice"; title: string; detail: string | null };

/**
 * Claude Code records some non-human turns as prompts: background-task notifications and
 * slash-command expansions arrive as XML-ish text. Show those as a short notice instead of a
 * wall of tags; anything else is the user's own words, shown as written.
 */
export function readPrompt(text: string): PromptView {
  const t = text.trim();
  if (t.startsWith("<task-notification>")) {
    const status = tag(t, "status");
    return {
      kind: "notice",
      title: tag(t, "summary") ?? `Background task ${status ?? "update"}`,
      detail: status,
    };
  }
  const command = tag(t, "command-name");
  if (t.startsWith("<command-") && command) {
    const args = tag(t, "command-args");
    return { kind: "notice", title: `Ran ${command}${args ? ` ${args}` : ""}`, detail: null };
  }
  return { kind: "user", text };
}

/** Duration worth showing: nothing under a second, which is most calls and only noise. */
export function took(call: ToolCall): string {
  if (!call.endedAt) return "";
  const ms = Date.parse(call.endedAt) - Date.parse(call.startedAt);
  if (!(ms >= 1000)) return "";
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/**
 * The call's whole text for the row: the full command, pattern or request as recorded, not the
 * 140-character summary the server keeps for lists.
 */
export function callText(call: ToolCall): string {
  const i = (call.input && typeof call.input === "object" ? call.input : {}) as Record<
    string,
    unknown
  >;
  if (call.files.length) return call.summary;
  const command = s(i.command);
  if (command) return command;
  const pattern = s(i.pattern);
  if (pattern) {
    const where = [s(i.path), s(i.glob) && `files ${i.glob}`].filter(Boolean).join(", ");
    return where ? `${pattern}  in ${where}` : pattern;
  }
  if (call.category === "agent") {
    return [s(i.subagent_type), s(i.description)].filter(Boolean).join(" · ") || call.summary;
  }
  return s(i.url) ?? s(i.query) ?? call.summary;
}

const texts = (v: unknown): string | null => {
  if (!Array.isArray(v)) return null;
  const parts = v
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>).text : null))
    .filter((t): t is string => typeof t === "string");
  return parts.length ? parts.join("\n\n") : null;
};

/**
 * A tool result as people read it. Claude Code records some results as JSON (a Read returns the
 * file text inside `file.content`; subagents and MCP tools return text blocks); show the text,
 * not the envelope. Anything unrecognised is shown as recorded.
 */
export function readableOutput(
  output: string | null,
): { text: string; note: string | null } | null {
  if (output === null) return null;
  const t = output.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return { text: output, note: null };
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch {
    return { text: output, note: null };
  }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const file = o.file && typeof o.file === "object" ? (o.file as Record<string, unknown>) : null;
  if (file && typeof file.content === "string") {
    const start = Number(file.startLine) || 1;
    const n = Number(file.numLines);
    const total = Number(file.totalLines);
    const note = n && total ? `Lines ${start}–${start + n - 1} of ${total}` : null;
    return { text: file.content, note };
  }
  const blocks = texts(v) ?? texts(o.content);
  if (blocks) return { text: blocks, note: null };
  return { text: JSON.stringify(v, null, 2), note: null };
}
