import { createHash } from "node:crypto";
import type { FileChange, LineDiff } from "./diff";
import { diffAll } from "./diff";
import { type StoryFile, type StoryHunk, storyPath } from "./story";
import { groupFileSymbols } from "./symbols";

/**
 * Turns a captured comparison into the file observations a Story can cite.
 *
 * Symbol groups and exact hunks are derived views of the same complete diff.
 * The helper never attributes a hunk to a tool or a person; Story links tool
 * calls to paths only by exact recorded path equality, and only in the story
 * projection.
 */

const HUNK_UNCERTAINTY =
  "A hunk is an exact captured line comparison. It does not establish who changed the lines, when they changed or why.";

function hash(parts: unknown[]): string {
  return `hunk-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24)}`;
}

function clip(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

type Range = { startLine: number; endLine: number };

function span(range: Range): string {
  return range.startLine === range.endLine
    ? `${range.startLine}`
    : `${range.startLine}-${range.endLine}`;
}

function range(values: (number | null)[]): Range | null {
  const lines = values.filter((line): line is number => line !== null);
  return lines.length === 0 ? null : { startLine: Math.min(...lines), endLine: Math.max(...lines) };
}

function label(
  path: { path: string; beforePath?: string | null },
  before: Range | null,
  after: Range | null,
): string {
  // Keep the exact ranges visible even when the captured path is long.
  const parts = [clip(storyPath(path), 160)];
  if (before) parts.push(`before ${span(before)}`);
  if (after) parts.push(`after ${span(after)}`);
  return clip(parts.join(" · "));
}

/** One hunk per contiguous run of changed lines, with both captured ranges. */
function hunks(change: FileChange, diff: LineDiff, evidenceIds: string[]): StoryHunk[] {
  if (diff.state !== "available") return [];
  const result: StoryHunk[] = [];
  let run: typeof diff.lines = [];

  const flush = () => {
    if (run.length === 0) return;
    const before = range(run.map((line) => line.beforeLine));
    const after = range(run.map((line) => line.afterLine));
    const status =
      before !== null && after !== null ? "modified" : after !== null ? "added" : "deleted";
    result.push({
      id: hash([change.id, before?.startLine, before?.endLine, after?.startLine, after?.endLine]),
      label: label(change, before, after),
      status,
      before,
      after,
      evidenceIds,
      uncertainty: HUNK_UNCERTAINTY,
    });
    run = [];
  };

  for (const line of diff.lines) {
    if (line.kind === "context") {
      flush();
      continue;
    }
    run.push(line);
  }
  flush();
  return result;
}

/**
 * Builds Story file observations from a complete comparison.
 *
 * The two evidence ids are the retained versions that bound the comparison
 * (the before/after snapshot event ids). Every symbol and hunk cites both.
 */
export function storyChanges(
  changes: FileChange[],
  evidence: { before: string; after: string },
): StoryFile[] {
  if (!evidence.before || !evidence.after)
    throw new Error("A story change needs both retained evidence ids.");
  const cited = [...new Set([evidence.before, evidence.after])].slice(0, 50);
  return changes.map((change) => {
    const diff = diffAll(change);
    const grouping = groupFileSymbols(change, diff);
    return {
      id: change.id,
      path: change.path,
      status: change.status,
      uncertainty: change.uncertainty,
      evidenceIds: cited,
      changeId: change.id,
      beforePath: change.beforePath,
      symbols: grouping.groups,
      hunks: hunks(change, diff, cited),
      syntaxState: grouping.state,
      syntaxReason: grouping.reason,
    };
  });
}
