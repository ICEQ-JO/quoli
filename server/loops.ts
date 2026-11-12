import type { LoopFinding, ToolCall, Turn } from "../shared/model.ts";
import { commandText } from "./report.ts";

/**
 * Loop and failure detectors (#128). Each is a plain rule over the recorded calls, so a finding
 * is inferred and says which rule fired; none claims the agent was wrong.
 */
export const LOOP_RULES = {
  repeatedFailure: 3,
  editChurn: 5,
  errorStreak: 4,
  stall: 10,
} as const;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const norm = (s: string) => s.trim().replace(/\s+/g, " ");
const byStart = (a: ToolCall, b: ToolCall) => a.startedAt.localeCompare(b.startedAt);
const text = (v: unknown) => (typeof v === "string" ? v : null);

/** The same command (whitespace-normalised) failed `repeatedFailure` or more times. */
function repeatedFailures(calls: ToolCall[]): LoopFinding[] {
  const groups = new Map<string, ToolCall[]>();
  for (const c of calls) {
    if (c.category !== "run" || c.status !== "failed") continue;
    const cmd = commandText(c.input);
    if (!cmd) continue;
    const key = norm(cmd);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups]
    .filter(([, list]) => list.length >= LOOP_RULES.repeatedFailure)
    .map(([cmd, list]) => ({
      id: `repeated-failure-${list[0].id}`,
      kind: "repeated-failure" as const,
      text: `The same command failed ${list.length} times: ${clip(cmd.split("\n")[0], 90)}`,
      rule: `one command failed ${LOOP_RULES.repeatedFailure} or more times`,
      toolCallIds: list.map((c) => c.id),
      files: [],
    }));
}

/** Old and new text of an edit call, when it records them (Claude Code, OpenCode). */
function editTexts(c: ToolCall): { old: string; new: string } | null {
  const i = (c.input && typeof c.input === "object" ? c.input : {}) as Record<string, unknown>;
  const o = text(i.old_string) ?? text(i.oldString);
  const n = text(i.new_string) ?? text(i.newString);
  return o !== null && n !== null ? { old: o, new: n } : null;
}

/**
 * One file edited `editChurn` or more times within a prompt, or an edit that exactly undoes an
 * earlier edit of the same file in the session.
 */
function editChurn(calls: ToolCall[], turns: Turn[]): LoopFinding[] {
  const out: LoopFinding[] = [];
  const edits = calls.filter((c) => c.category === "edit" && c.status !== "failed" && c.files[0]);
  turns.forEach((turn, t) => {
    const ids = new Set(turn.toolCallIds);
    const perFile = new Map<string, ToolCall[]>();
    for (const c of edits) {
      if (!ids.has(c.id)) continue;
      const f = c.files[0];
      perFile.set(f, [...(perFile.get(f) ?? []), c]);
    }
    for (const [file, list] of perFile) {
      if (list.length < LOOP_RULES.editChurn) continue;
      out.push({
        id: `edit-churn-${t}-${file}`,
        kind: "edit-churn",
        text: `${file} was edited ${list.length} times after one prompt`,
        rule: `one file edited ${LOOP_RULES.editChurn} or more times after a single prompt`,
        toolCallIds: list.map((c) => c.id),
        files: [file],
      });
    }
  });
  const seen: { call: ToolCall; t: { old: string; new: string } }[] = [];
  for (const c of [...edits].sort(byStart)) {
    const t = editTexts(c);
    if (!t || t.old === t.new) continue;
    const undone = seen.find(
      (s) => s.call.files[0] === c.files[0] && s.t.new === t.old && s.t.old === t.new,
    );
    if (undone) {
      out.push({
        id: `revert-${c.id}`,
        kind: "edit-churn",
        text: `An edit to ${c.files[0]} undid an earlier edit`,
        rule: "an edit replaced exactly what an earlier edit of the same file wrote, with what it removed",
        toolCallIds: [undone.call.id, c.id],
        files: [c.files[0]],
      });
    }
    seen.push({ call: c, t });
  }
  return out;
}

/** `errorStreak` or more calls in a row failed (per agent, in time order). */
function errorStreaks(calls: ToolCall[]): LoopFinding[] {
  const out: LoopFinding[] = [];
  const agents = new Map<string, ToolCall[]>();
  for (const c of [...calls].sort(byStart)) {
    agents.set(c.agentId, [...(agents.get(c.agentId) ?? []), c]);
  }
  for (const list of agents.values()) {
    let run: ToolCall[] = [];
    const flush = () => {
      if (run.length >= LOOP_RULES.errorStreak) {
        out.push({
          id: `error-streak-${run[0].id}`,
          kind: "error-streak",
          text: `${run.length} calls in a row failed`,
          rule: `${LOOP_RULES.errorStreak} or more consecutive failed calls`,
          toolCallIds: run.map((c) => c.id),
          files: [...new Set(run.flatMap((c) => c.files))],
        });
      }
      run = [];
    };
    for (const c of list) {
      if (c.status === "failed") run.push(c);
      else flush();
    }
    flush();
  }
  return out;
}

/** A prompt answered only by `stall` or more reads and searches, with no edit or command. */
function stalls(calls: ToolCall[], turns: Turn[]): LoopFinding[] {
  const byId = new Map(calls.map((c) => [c.id, c]));
  return turns.flatMap((turn, t) => {
    const own = turn.toolCallIds.map((id) => byId.get(id)).filter((c): c is ToolCall => !!c);
    const looking = own.filter((c) => c.category === "read" || c.category === "search");
    const acted = own.some((c) => c.category === "edit" || c.category === "run");
    if (acted || looking.length < LOOP_RULES.stall) return [];
    return [
      {
        id: `stall-${t}`,
        kind: "stall" as const,
        text: `${looking.length} reads and searches after prompt ${t + 1}, with no edit or command. Worth a look.`,
        rule: `${LOOP_RULES.stall} or more reads and searches after a prompt, and no edit or command`,
        toolCallIds: looking.map((c) => c.id),
        files: [],
      },
    ];
  });
}

/** Every loop finding for a session, in a stable order. */
export function findLoops(calls: ToolCall[], turns: Turn[]): LoopFinding[] {
  return [
    ...repeatedFailures(calls),
    ...errorStreaks(calls),
    ...editChurn(calls, turns),
    ...stalls(calls, turns),
  ];
}
