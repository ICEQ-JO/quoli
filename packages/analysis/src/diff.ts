import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { RepositoryFile, StoredSnapshot } from "../../schema/src/repository";

/**
 * Deterministic comparison of two captured, sanitized repository snapshots.
 *
 * Only sanitized text and content fingerprints are compared; raw source is never read.
 * An absence is a fact only when the capture that could have listed the path was
 * complete, so omitted or racy captures never turn missing entries into creates
 * or deletes.
 */

export type FileStatus = "added" | "deleted" | "modified" | "unchanged" | "unavailable" | "renamed";

export type ChangeBasis = "derived" | "inferred";

export interface FileChange {
  /** Deterministic SHA-256 of the sanitized path and the compared snapshot ids. */
  id: string;
  path: string;
  beforePath: string | null;
  status: FileStatus;
  basis: ChangeBasis;
  rule: string;
  before: RepositoryFile | null;
  after: RepositoryFile | null;
  uncertainty: string | null;
}

export interface Comparison {
  beforeId: string | null;
  afterId: string;
  baselineDirty: boolean | null;
  /** Every captured path was compared from two complete captures. */
  complete: boolean;
  warnings: string[];
  files: FileChange[];
  /** Paths dropped by the comparison hard cap. */
  omitted: number;
}

export interface DiffLine {
  kind: "context" | "add" | "delete";
  beforeLine: number | null;
  afterLine: number | null;
  /** Exact captured line, including its trailing newline when the line has one. */
  text: string;
}

export interface LineDiff {
  state: "available" | "unavailable" | "bounded";
  lines: DiffLine[];
  nextCursor: number | null;
  total: number | null;
  additions: number | null;
  deletions: number | null;
  reason: string | null;
}

const PAIR_RULE = "captured-snapshot-pair/v1";
const RENAME_RULE = "unique-sanitized-content-rename/v1";
const MAX_PATHS = 2000;
const MAX_LINES_PER_SIDE = 2000;
const MAX_DIFF_CELLS = 4_000_000;
const MAX_COMBINED_BYTES = 1_048_576;
const MAX_PAGE_LINES = 200;
const DEFAULT_PAGE_LINES = 100;

type Presence = "present" | "absent" | "unknown";
type Quality = "full" | "partial" | "none";

function sha256(parts: (string | number | null)[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function comparePaths(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function groupByPath(files: RepositoryFile[]): Map<string, RepositoryFile[]> {
  const groups = new Map<string, RepositoryFile[]>();
  for (const file of files) {
    const group = groups.get(file.path);
    if (group) group.push(file);
    else groups.set(file.path, [file]);
  }
  return groups;
}

function presenceOf(file: RepositoryFile): Presence {
  if (file.status === "deleted") return "absent";
  if (file.status === "unavailable") return "unknown";
  return "present";
}

/** How much of the file the capture actually holds. */
function qualityOf(file: RepositoryFile): Quality {
  if (file.status === "present" && file.content.state === "present" && file.content.text !== null)
    return "full";
  if (file.content.state === "truncated" || file.content.state === "redacted") return "partial";
  return "none";
}

function fullText(file: RepositoryFile): string | null {
  return qualityOf(file) === "full" ? file.content.text : null;
}

function qualityNote(side: "before" | "after", file: RepositoryFile): string | null {
  const quality = qualityOf(file);
  if (quality === "full") return null;
  const status = file.status === "present" ? "" : ` and file status is ${file.status}`;
  if (file.content.state === "present")
    return `${side} content state is present but the captured text is missing${status}; the comparison is limited to what was captured.`;
  const scope = quality === "partial" ? "partial capture" : "not text-comparable";
  return `${side} content is ${file.content.state}${status} (${scope}); the comparison is limited to what was captured.`;
}

/** Equality evidence shared by both sides, or null when the two sides are not comparable. */
function compareContent(
  before: RepositoryFile,
  after: RepositoryFile,
): {
  status: FileStatus;
  uncertainty: string | null;
} {
  const notes: string[] = [];
  const beforeNote = qualityNote("before", before);
  const afterNote = qualityNote("after", after);
  if (beforeNote) notes.push(beforeNote);
  if (afterNote) notes.push(afterNote);

  const beforeFingerprint = before.fingerprint;
  const afterFingerprint = after.fingerprint;
  let same: boolean;
  if (beforeFingerprint !== null && afterFingerprint !== null) {
    same = beforeFingerprint === afterFingerprint;
    if (
      same &&
      fullText(before) !== null &&
      fullText(after) !== null &&
      before.content.text !== after.content.text
    )
      return {
        status: "unavailable",
        uncertainty: "Fingerprints match but the captured text differs; file identity is unclear.",
      };
  } else if (fullText(before) !== null && fullText(after) !== null) {
    same = before.content.text === after.content.text;
  } else {
    notes.push("Captured content is not comparable across the two sides.");
    return { status: "unavailable", uncertainty: notes.join(" ") };
  }
  return {
    status: same ? "unchanged" : "modified",
    uncertainty: notes.length ? notes.join(" ") : null,
  };
}

interface SideState {
  presence: Presence;
  reason: string | null;
}

function sideState(
  file: RepositoryFile | null,
  complete: boolean,
  side: "before" | "after",
): SideState {
  if (file === null) {
    return complete
      ? { presence: "absent", reason: null }
      : {
          presence: "unknown",
          reason: `${side} capture did not list this path and was not a complete capture, so absence is not established.`,
        };
  }
  if (file.status === "unavailable")
    return {
      presence: "unknown",
      reason: `${side} file could not be read (status ${file.status}).`,
    };
  return { presence: presenceOf(file), reason: null };
}

interface ChangeContext {
  beforeId: string | null;
  afterId: string;
  beforeComplete: boolean;
  afterComplete: boolean;
  baselineMissing: boolean;
}

function buildChange(
  path: string,
  index: number,
  beforeGroup: RepositoryFile[],
  afterGroup: RepositoryFile[],
  context: ChangeContext,
): FileChange {
  const beforeFile = beforeGroup[index] ?? null;
  const afterFile = afterGroup[index] ?? null;
  const duplicate = beforeGroup.length > 1 || afterGroup.length > 1;
  const notes: string[] = [];

  const before = sideState(beforeFile, context.beforeComplete, "before");
  const after = sideState(afterFile, context.afterComplete, "after");

  let status: FileStatus;
  if (context.baselineMissing) {
    status = "unavailable";
    notes.push("Baseline snapshot is unavailable, so no before side could be established.");
  } else if (before.presence === "unknown" || after.presence === "unknown") {
    status = "unavailable";
    notes.push(before.reason ?? after.reason ?? "One side of the comparison is unknown.");
  } else if (
    before.presence === "present" &&
    after.presence === "present" &&
    beforeFile &&
    afterFile
  ) {
    const result = compareContent(beforeFile, afterFile);
    status = result.status;
    if (result.uncertainty) notes.push(result.uncertainty);
  } else if (before.presence === "present") {
    status = "deleted";
  } else if (after.presence === "present") {
    status = "added";
  } else {
    status = "unchanged";
  }

  if (duplicate) {
    notes.push(
      `Duplicate sanitized path: ${beforeGroup.length} before and ${afterGroup.length} after entries share "${path}"; entries are paired by position and the original identity is not recoverable.`,
    );
    status = "unavailable";
    notes.push(
      "The entries cannot be attributed to one original file, so no file diff is established.",
    );
  }

  if (status === "added" && afterFile) {
    const note = qualityNote("after", afterFile);
    if (note) notes.push(note);
  }
  if (status === "deleted" && beforeFile) {
    const note = qualityNote("before", beforeFile);
    if (note) notes.push(note);
  }
  const id = duplicate
    ? sha256([path, context.beforeId, context.afterId, index])
    : sha256([path, context.beforeId, context.afterId]);

  return {
    id,
    path,
    beforePath: null,
    status,
    basis: "derived",
    rule: PAIR_RULE,
    before: beforeFile,
    after: afterFile,
    uncertainty: notes.length ? notes.join(" ") : null,
  };
}

/** Rename is an inference: identical sanitized text that maps one deleted file to one added file. */
function inferRenames(changes: FileChange[]): { changes: FileChange[]; renamed: number } {
  const deleted = new Map<string, FileChange[]>();
  const added = new Map<string, FileChange[]>();
  for (const change of changes) {
    const text = change.status === "deleted" && change.before ? fullText(change.before) : null;
    const addedText = change.status === "added" && change.after ? fullText(change.after) : null;
    if (text !== null) {
      const list = deleted.get(text);
      if (list) list.push(change);
      else deleted.set(text, [change]);
    }
    if (addedText !== null) {
      const list = added.get(addedText);
      if (list) list.push(change);
      else added.set(addedText, [change]);
    }
  }

  const pairs = new Map<FileChange, FileChange>();
  for (const [text, deletions] of deleted) {
    const additions = added.get(text);
    if (additions && deletions.length === 1 && additions.length === 1)
      pairs.set(additions[0], deletions[0]);
  }
  if (!pairs.size) return { changes, renamed: 0 };

  const removed = new Set(pairs.values());
  const result: FileChange[] = [];
  for (const change of changes) {
    const deletion = pairs.get(change);
    if (deletion) {
      result.push({
        id: change.id,
        path: change.path,
        beforePath: deletion.path,
        status: "renamed",
        basis: "inferred",
        rule: RENAME_RULE,
        before: deletion.before,
        after: change.after,
        uncertainty:
          "Rename inferred from identical sanitized text; the capture does not record renames.",
      });
      continue;
    }
    if (removed.has(change)) continue;
    result.push(change);
  }
  return { changes: result, renamed: pairs.size };
}

export function compareSnapshots(before: StoredSnapshot | null, after: StoredSnapshot): Comparison {
  const warnings: string[] = [];
  const beforeComplete = before !== null && before.state === "observed" && before.omitted === 0;
  const afterComplete = after.state === "observed" && after.omitted === 0;

  const beforeGroups = groupByPath(before?.files ?? []);
  const afterGroups = groupByPath(after.files);
  const paths = [...new Set([...beforeGroups.keys(), ...afterGroups.keys()])].sort(comparePaths);
  const capped = paths.slice(0, MAX_PATHS);
  const omitted = paths.length - capped.length;

  const context: ChangeContext = {
    beforeId: before?.id ?? null,
    afterId: after.id,
    beforeComplete,
    afterComplete,
    baselineMissing: before === null,
  };

  const changes: FileChange[] = [];
  let duplicatePaths = 0;
  for (const path of capped) {
    const beforeGroup = beforeGroups.get(path) ?? [];
    const afterGroup = afterGroups.get(path) ?? [];
    const size = Math.max(beforeGroup.length, afterGroup.length);
    if (size > 1) duplicatePaths++;
    for (let index = 0; index < size; index++)
      changes.push(buildChange(path, index, beforeGroup, afterGroup, context));
  }

  const renamed = inferRenames(changes);
  const files = renamed.changes.sort((a, b) => comparePaths(a.path, b.path));

  if (before === null) {
    warnings.push("Baseline snapshot is unavailable; no before side could be established.");
  } else {
    if (before.omitted > 0)
      warnings.push(
        `Baseline snapshot omitted ${before.omitted} files; absences are not established.`,
      );
    if (before.state === "racy")
      warnings.push("Baseline snapshot was racy; captured content may be inconsistent.");
    for (const warning of before.warnings) warnings.push(`Baseline: ${warning}`);
  }
  if (after.omitted > 0)
    warnings.push(`After snapshot omitted ${after.omitted} files; absences are not established.`);
  if (after.state === "racy")
    warnings.push("After snapshot was racy; captured content may be inconsistent.");
  for (const warning of after.warnings) warnings.push(`After: ${warning}`);
  if (omitted > 0)
    warnings.push(`${omitted} paths were omitted by the ${MAX_PATHS}-path comparison cap.`);
  if (duplicatePaths > 0)
    warnings.push(
      `${duplicatePaths} sanitized path(s) appear more than once; entries were paired by position.`,
    );
  if (renamed.renamed > 0)
    warnings.push(`${renamed.renamed} rename(s) were inferred from identical sanitized text.`);

  return {
    beforeId: before?.id ?? null,
    afterId: after.id,
    baselineDirty: before ? before.dirty : null,
    complete:
      before !== null &&
      beforeComplete &&
      afterComplete &&
      omitted === 0 &&
      duplicatePaths === 0 &&
      files.every((file) => file.uncertainty === null),
    warnings,
    files,
    omitted,
  };
}

/** Splits into lines that keep their terminator, so a newline-only change stays visible. */
function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      lines.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
}

function diffOps(before: string[], after: string[]): DiffLine[] | null {
  const n = before.length;
  const m = after.length;
  let prefix = 0;
  while (prefix < n && prefix < m && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < n - prefix &&
    suffix < m - prefix &&
    before[n - 1 - suffix] === after[m - 1 - suffix]
  )
    suffix++;

  const middle = lcsOps(before.slice(prefix, n - suffix), after.slice(prefix, m - suffix), prefix);
  if (!middle) return null;

  const ops: DiffLine[] = [];
  for (let i = 0; i < prefix; i++)
    ops.push({ kind: "context", beforeLine: i + 1, afterLine: i + 1, text: before[i] });
  ops.push(...middle);
  for (let i = 0; i < suffix; i++)
    ops.push({
      kind: "context",
      beforeLine: n - suffix + i + 1,
      afterLine: m - suffix + i + 1,
      text: before[n - suffix + i],
    });
  return ops;
}

/** Classic LCS table; null when the pair would exceed the cell budget. */
function lcsOps(before: string[], after: string[], offset: number): DiffLine[] | null {
  const n = before.length;
  const m = after.length;
  if ((n + 1) * (m + 1) > MAX_DIFF_CELLS) return null;
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        before[i] === after[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const ops: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({
        kind: "context",
        beforeLine: offset + i + 1,
        afterLine: offset + j + 1,
        text: before[i],
      });
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ kind: "delete", beforeLine: offset + i + 1, afterLine: null, text: before[i] });
      i++;
    } else {
      ops.push({ kind: "add", beforeLine: null, afterLine: offset + j + 1, text: after[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ kind: "delete", beforeLine: offset + i + 1, afterLine: null, text: before[i] });
    i++;
  }
  while (j < m) {
    ops.push({ kind: "add", beforeLine: null, afterLine: offset + j + 1, text: after[j] });
    j++;
  }
  return ops;
}

function comparableText(
  file: RepositoryFile | null,
  side: "before" | "after",
): { ok: true; text: string } | { ok: false; reason: string } {
  if (!file) return { ok: false, reason: `The ${side} side of the comparison is not captured.` };
  if (file.status !== "present")
    return {
      ok: false,
      reason: `The ${side} file status is ${file.status}; it has no comparable text capture.`,
    };
  if (file.content.state !== "present")
    return {
      ok: false,
      reason: `The ${side} content state is ${file.content.state}; a complete diff cannot be shown.`,
    };
  if (file.content.text === null)
    return { ok: false, reason: `The ${side} captured text is missing.` };
  return { ok: true, text: file.content.text };
}

function unavailable(reason: string): LineDiff {
  return {
    state: "unavailable",
    lines: [],
    nextCursor: null,
    total: null,
    additions: null,
    deletions: null,
    reason,
  };
}

function bounded(reason: string): LineDiff {
  return {
    state: "bounded",
    lines: [],
    nextCursor: null,
    total: null,
    additions: null,
    deletions: null,
    reason,
  };
}

/** Every changed line for a file, before any page is taken. */
export function diffAll(change: FileChange): LineDiff {
  if (change.status === "unavailable")
    return unavailable(
      change.uncertainty ?? "The comparison did not establish this file's content.",
    );

  let beforeText = "";
  let afterText = "";
  if (change.status === "added") {
    const after = comparableText(change.after, "after");
    if (!after.ok) return unavailable(after.reason);
    afterText = after.text;
  } else if (change.status === "deleted") {
    const before = comparableText(change.before, "before");
    if (!before.ok) return unavailable(before.reason);
    beforeText = before.text;
  } else {
    const before = comparableText(change.before, "before");
    if (!before.ok) return unavailable(before.reason);
    const after = comparableText(change.after, "after");
    if (!after.ok) return unavailable(after.reason);
    beforeText = before.text;
    afterText = after.text;
  }

  const beforeLines = splitLines(beforeText);
  const afterLines = splitLines(afterText);
  if (beforeLines.length > MAX_LINES_PER_SIDE || afterLines.length > MAX_LINES_PER_SIDE)
    return bounded(`Files above ${MAX_LINES_PER_SIDE} lines per side are not diffed.`);
  if (Buffer.byteLength(beforeText) + Buffer.byteLength(afterText) > MAX_COMBINED_BYTES)
    return bounded(`Combined input above ${MAX_COMBINED_BYTES} bytes is not diffed.`);

  const ops = diffOps(beforeLines, afterLines);
  if (!ops) return bounded(`The comparison exceeds the ${MAX_DIFF_CELLS}-cell diff budget.`);

  return {
    state: "available",
    lines: ops,
    nextCursor: null,
    total: ops.length,
    additions: ops.filter((op) => op.kind === "add").length,
    deletions: ops.filter((op) => op.kind === "delete").length,
    reason: null,
  };
}

/** Takes a bounded page from a complete diff without recomputing it. */
export function diffPage(diff: LineDiff, options?: { cursor?: number; limit?: number }): LineDiff {
  const cursor =
    Number.isInteger(options?.cursor) && (options?.cursor as number) >= 0
      ? (options?.cursor as number)
      : 0;
  const requested = options?.limit;
  const limit =
    Number.isInteger(requested) && (requested as number) >= 1
      ? Math.min(requested as number, MAX_PAGE_LINES)
      : DEFAULT_PAGE_LINES;
  if (diff.state !== "available") return diff;
  const page = diff.lines.slice(cursor, cursor + limit);
  return {
    ...diff,
    lines: page,
    nextCursor: cursor + page.length < diff.lines.length ? cursor + page.length : null,
  };
}

export function diffFile(
  change: FileChange,
  options?: { cursor?: number; limit?: number },
): LineDiff {
  return diffPage(diffAll(change), options);
}
