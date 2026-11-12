import type {
  CommandRun,
  FileChange,
  ReviewItem,
  SessionReport,
  ToolCall,
} from "../shared/model.ts";
import { sessionExtensions } from "./extensions.ts";
import { slowestCalls } from "./steps.ts";

const LARGE_DELETION = 40;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Lines in a string, ignoring one trailing newline; "" is 0 lines. */
export function countLines(s: string): number {
  if (s === "") return 0;
  return (s.endsWith("\n") ? s.slice(0, -1) : s).split("\n").length;
}

export function classifyCommand(command: string): CommandRun["kind"] {
  if (/^\s*git\s/.test(command)) return "other";
  if (/\b(test|jest|vitest|pytest|rspec)\b|go test|cargo test|node --test/.test(command)) {
    return "test";
  }
  if (/\b(tsc|typecheck|mypy|pyright)\b/.test(command)) return "typecheck";
  if (/\b(lint|eslint|biome|ruff|flake8|clippy)\b|prettier --check/.test(command)) return "lint";
  if (/\b(build|make)\b/.test(command)) return "build";
  return "other";
}

/** A run call's command line: Claude Code and OpenCode send a string, Codex an argument list. */
export function commandText(input: unknown): string | null {
  const c = (input && typeof input === "object" ? input : {}) as { command?: unknown };
  if (typeof c.command === "string") return c.command;
  if (Array.isArray(c.command) && c.command.every((a) => typeof a === "string")) {
    return c.command.join(" ");
  }
  return null;
}

/** Per-file line counts in a Codex `apply_patch` body (`*** Update File: path`, then +/- lines). */
function patchPieces(
  patch: string,
): { path: string; added: number; removed: number; add: boolean }[] {
  const out: { path: string; added: number; removed: number; add: boolean }[] = [];
  for (const line of patch.split("\n")) {
    const head = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (head) out.push({ path: head[2].trim(), added: 0, removed: 0, add: head[1] === "Add" });
    else if (!out.length || line.startsWith("***")) continue;
    else if (line.startsWith("+")) out[out.length - 1].added++;
    else if (line.startsWith("-")) out[out.length - 1].removed++;
  }
  return out;
}

type EditPiece = { path: string; added: number; removed: number; rewrite: boolean; callId: string };

/** Per-edit line counts from the recorded input; failed calls changed nothing and are skipped. */
function editPieces(call: ToolCall): EditPiece[] {
  const path = call.files[0];
  if (call.category !== "edit" || call.status === "failed" || !path) return [];
  const name = call.name.toLowerCase();
  const i = (call.input && typeof call.input === "object" ? call.input : {}) as Record<
    string,
    unknown
  >;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const piece = (added: number, removed: number, rewrite = false): EditPiece => ({
    path,
    added,
    removed,
    rewrite,
    callId: call.id,
  });
  if (name === "write") return [piece(countLines(text(i.content)), 0, true)];
  // MultiEdit (Claude Code) and Pi's edit carry a list of replacements.
  if ((name === "multiedit" || name === "edit") && Array.isArray(i.edits)) {
    return i.edits.map((e) => {
      const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
      return piece(countLines(text(o.new_string)), countLines(text(o.old_string)));
    });
  }
  if (name === "edit") {
    // Claude Code uses snake_case fields, OpenCode camelCase.
    const added = text(i.new_string ?? i.newString);
    const removed = text(i.old_string ?? i.oldString);
    return [piece(countLines(added), countLines(removed))];
  }
  if (name === "apply_patch" || name === "patch") {
    const body = [i.input, i.patch, i.command].find((v) => typeof v === "string");
    return patchPieces(text(body)).flatMap((p) => {
      const file = call.files.find((f) => p.path === f || p.path.endsWith(`/${f}`));
      return file ? [{ ...piece(p.added, p.removed, p.add), path: file }] : [];
    });
  }
  return [];
}

export function fileChanges(calls: ToolCall[]): FileChange[] {
  const byPath = new Map<string, FileChange>();
  for (const call of calls) {
    for (const p of editPieces(call)) {
      const c = byPath.get(p.path) ?? {
        path: p.path,
        added: 0,
        removed: 0,
        rewrite: false,
        toolCallIds: [],
      };
      c.added += p.added;
      c.removed += p.removed;
      c.rewrite ||= p.rewrite;
      if (!c.toolCallIds.includes(p.callId)) c.toolCallIds.push(p.callId);
      byPath.set(p.path, c);
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function commandRuns(calls: ToolCall[]): CommandRun[] {
  return calls.flatMap((c) => {
    const command = commandText(c.input);
    if (c.category !== "run" || command === null) return [];
    return [
      {
        toolCallId: c.id,
        command,
        kind: classifyCommand(command),
        status: c.status,
        at: c.startedAt,
      },
    ];
  });
}

/** Review prompts, never claims of correctness. */
export function checklist(calls: ToolCall[], commands: CommandRun[]): ReviewItem[] {
  const items: ReviewItem[] = [];
  const order = new Map(calls.map((c, i) => [c.id, i]));

  // 1. Files edited after the last test command.
  const lastTest = commands.findLast((c) => c.kind === "test");
  const lastTestAt = lastTest ? (order.get(lastTest.toolCallId) ?? -1) : -1;
  const after = calls.filter((c, i) => i > lastTestAt && editPieces(c).length > 0);
  if (after.length) {
    const files = [...new Set(after.flatMap((c) => c.files))];
    items.push({
      id: "edited-after-test",
      text: lastTest
        ? `${files.length === 1 ? "1 file was" : `${files.length} files were`} edited after the last test command`
        : "No test command was run",
      toolCallIds: after.map((c) => c.id),
      files,
    });
  }

  // 2. Failed commands with no later successful run of the same command text.
  commands.forEach((c, i) => {
    if (c.status !== "failed") return;
    const same = (o: CommandRun) => o.command.trim() === c.command.trim();
    if (commands.slice(i + 1).some((o) => same(o) && o.status === "ok")) return;
    items.push({
      id: `failed-${c.toolCallId}`,
      text: `Command failed and was not later run successfully: ${clip(c.command.split("\n")[0], 100)}`,
      toolCallIds: [c.toolCallId],
      files: [],
    });
  });

  // 3. Single edits removing many lines.
  for (const call of calls) {
    const big = editPieces(call).find((p) => p.removed >= LARGE_DELETION);
    if (big) {
      items.push({
        id: `large-deletion-${call.id}`,
        text: `Large deletion in ${big.path} (${big.removed} lines removed by one edit)`,
        toolCallIds: [call.id],
        files: [big.path],
      });
    }
  }
  return items;
}

export function buildReport(
  calls: ToolCall[],
  costByModel: SessionReport["costByModel"],
  priceVersion: string,
  turns: SessionReport["turns"] = [],
  loops: SessionReport["loops"] = [],
): SessionReport {
  const commands = commandRuns(calls);
  return {
    changes: fileChanges(calls),
    commands,
    checklist: checklist(calls, commands),
    turns,
    loops,
    extensions: sessionExtensions(calls),
    slowest: slowestCalls(calls),
    costByModel,
    priceVersion,
  };
}
