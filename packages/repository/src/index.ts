import { createHash, randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { type CapturePolicy, type Content, policySchema } from "@traceframe/schema";
import { isExcluded, redact, sanitizeContent } from "@traceframe/schema/privacy";
import { inspectPath, readRegularFile } from "./files";
import {
  createGitRunner,
  decodePath,
  type GitRunner,
  parseRawDiffPaths,
  splitNulBytes,
} from "./git";

export type CaptureOptions = {
  includeUntracked?: boolean;
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
};

export type RepositoryFileStatus =
  | "present"
  | "deleted"
  | "symlink"
  | "submodule"
  | "binary"
  | "oversized"
  | "excluded"
  | "unavailable"
  | "racy";

export type RepositoryFile = {
  /** Path relative to the registered root, redacted before it leaves this module. */
  path: string;
  tracked: boolean;
  staged: boolean;
  status: RepositoryFileStatus;
  content: Content;
  /** Hash of the sanitized text that is actually stored, never of raw file bytes. */
  fingerprint: string | null;
};

export type RepositorySnapshot = {
  id: string;
  capturedAt: string;
  head: string | null;
  indexIdentity: string | null;
  state: "observed" | "racy";
  dirty: boolean | null;
  files: RepositoryFile[];
  omitted: number;
  warnings: string[];
};

const MAX_FILES_CEILING = 1000;
const MAX_FILE_BYTES_CEILING = 1024 * 1024;
const MAX_TOTAL_BYTES_CEILING = 20 * 1024 * 1024;

type Limits = Required<CaptureOptions>;

type IndexEntry = { mode: string; oid: string };

type Listing = {
  tracked: Map<string, IndexEntry>;
  staged: Set<string>;
  unmerged: Set<string>;
  untracked: string[];
  untrackedCount: number;
  invalid: number;
};

type Candidate = {
  path: string;
  tracked: boolean;
  staged: boolean;
  mode: string;
  deleted: boolean;
};

function resolveLimits(options: CaptureOptions): Limits {
  const limits: Limits = {
    includeUntracked: options.includeUntracked === true,
    maxFiles: options.maxFiles ?? MAX_FILES_CEILING,
    maxFileBytes: options.maxFileBytes ?? MAX_FILE_BYTES_CEILING,
    maxTotalBytes: options.maxTotalBytes ?? MAX_TOTAL_BYTES_CEILING,
  };
  if (
    !Number.isSafeInteger(limits.maxFiles) ||
    limits.maxFiles < 1 ||
    limits.maxFiles > MAX_FILES_CEILING
  )
    throw new Error("Invalid capture limits");
  if (
    !Number.isSafeInteger(limits.maxFileBytes) ||
    limits.maxFileBytes < 1 ||
    limits.maxFileBytes > MAX_FILE_BYTES_CEILING
  )
    throw new Error("Invalid capture limits");
  if (
    !Number.isSafeInteger(limits.maxTotalBytes) ||
    limits.maxTotalBytes < 1 ||
    limits.maxTotalBytes > MAX_TOTAL_BYTES_CEILING
  )
    throw new Error("Invalid capture limits");
  return limits;
}

/** Resolves the registered root. Failures never mention the path itself. */
function resolveRoot(root: string): string {
  if (typeof root !== "string" || root.length === 0) throw new Error("Repository root is required");
  try {
    const real = realpathSync(root);
    if (!lstatSync(real).isDirectory()) throw new Error("Directory required");
    return real;
  } catch {
    throw new Error("Repository root does not exist or is not accessible");
  }
}

function isCommitId(value: string): boolean {
  return /^[0-9a-f]{40,64}$/.test(value);
}

async function readHead(git: GitRunner): Promise<string | null> {
  const output = await git.optional(["rev-parse", "--verify", "--quiet", "HEAD"]);
  if (output === null) return null;
  const head = output.toString("utf8").trim();
  return isCommitId(head) ? head : null;
}

/**
 * Identity of the index built from file metadata only. Index contents hold path
 * names that may be sensitive, so the identity never hashes them.
 */
async function readIndexIdentity(indexPath: string): Promise<string | null> {
  try {
    const stats = lstatSync(indexPath, { bigint: true });
    if (!stats.isFile()) return null;
    const metadata = `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}`;
    return createHash("sha256").update(metadata).digest("hex");
  } catch {
    return null;
  }
}

async function readIndexPath(git: GitRunner, root: string): Promise<string> {
  const output = await git.require(["rev-parse", "--git-path", "index"]);
  const raw = output.toString("utf8").trim();
  return isAbsolute(raw) ? raw : resolve(root, raw);
}

async function readListing(
  git: GitRunner,
  head: string | null,
  includeUntracked: boolean,
): Promise<Listing> {
  const tracked = new Map<string, IndexEntry>();
  const unmerged = new Set<string>();
  const invalidPaths = new Set<string>();
  for (const record of splitNulBytes(await git.require(["ls-files", "-z", "--stage"]))) {
    const tab = record.indexOf(0x09);
    if (tab < 0) continue;
    const meta = record.subarray(0, tab).toString("utf8").split(" ");
    const decoded = decodePath(record.subarray(tab + 1));
    if (!decoded.valid) {
      // A path that is not valid UTF-8 cannot be reported faithfully.
      invalidPaths.add(record.subarray(tab + 1).toString("base64"));
      continue;
    }
    const path = decoded.path;
    if (!path) continue;
    if (Number(meta[2] ?? "0") !== 0) unmerged.add(path);
    if (!tracked.has(path)) tracked.set(path, { oid: meta[1] ?? "", mode: meta[0] ?? "" });
  }
  const staged = new Set<string>();
  if (head === null) {
    // An unborn HEAD has no commit to compare against: every index entry is staged.
    for (const path of tracked.keys()) staged.add(path);
  } else {
    const raw = await git.require([
      "diff-index",
      "--cached",
      "--raw",
      "-z",
      "--no-renames",
      "--no-ext-diff",
      "--no-textconv",
      head,
    ]);
    const parsed = parseRawDiffPaths(raw);
    for (const key of parsed.invalid) invalidPaths.add(key);
    for (const path of parsed.paths) staged.add(path);
  }
  const untracked: string[] = [];
  let untrackedCount = 0;
  // Enumerate names to establish dirtiness; body capture remains separately consented.
  const others = await git.require(["ls-files", "-z", "--others", "--exclude-standard"]);
  for (const record of splitNulBytes(others)) {
    if (!record.length) continue;
    untrackedCount++;
    if (!includeUntracked) continue;
    const decoded = decodePath(record);
    if (!decoded.valid) {
      invalidPaths.add(record.toString("base64"));
      continue;
    }
    if (decoded.path) untracked.push(decoded.path);
  }
  return { tracked, staged, unmerged, untracked, untrackedCount, invalid: invalidPaths.size };
}

function sameListing(before: Listing, after: Listing): boolean {
  if (before.tracked.size !== after.tracked.size) return false;
  for (const [path, entry] of before.tracked) {
    const other = after.tracked.get(path);
    if (!other || other.mode !== entry.mode || other.oid !== entry.oid) return false;
  }
  if (before.staged.size !== after.staged.size) return false;
  for (const path of before.staged) if (!after.staged.has(path)) return false;
  if (before.untracked.length !== after.untracked.length) return false;
  if (before.untrackedCount !== after.untrackedCount) return false;
  if (before.invalid !== after.invalid) return false;
  return before.untracked.every((path, index) => after.untracked[index] === path);
}

function buildCandidates(listing: Listing): Candidate[] {
  const candidates: Candidate[] = [];
  for (const [path, entry] of listing.tracked) {
    candidates.push({
      path,
      tracked: true,
      staged: listing.staged.has(path),
      mode: entry.mode,
      deleted: false,
    });
  }
  for (const path of listing.staged) {
    // Staged deletions are gone from the index but were tracked before.
    if (!listing.tracked.has(path))
      candidates.push({ path, tracked: true, staged: true, mode: "", deleted: true });
  }
  for (const path of listing.untracked) {
    candidates.push({ path, tracked: false, staged: false, mode: "", deleted: false });
  }
  candidates.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return candidates;
}

function disabledContent(size: number | null): Content {
  return { text: null, state: "disabled", originalBytes: size, categories: ["code"] };
}

function unavailableContent(size: number | null): Content {
  return { text: null, state: "unavailable", originalBytes: size, categories: ["code"] };
}

function fingerprintOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Decodes captured bytes. NUL bytes mark binary, invalid UTF-8 marks malformed. */
function decodeContent(bytes: Buffer, size: number, policy: CapturePolicy): Content {
  if (bytes.includes(0)) {
    return { text: null, state: "unsupported", originalBytes: size, categories: ["code"] };
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { text: null, state: "malformed", originalBytes: size, categories: ["code"] };
  }
  return sanitizeContent(
    { text, state: "present", originalBytes: size, categories: ["code"] },
    policy,
    ["code"],
  );
}

/**
 * Captures a read-only view of a repository working tree.
 *
 * The capture is bounded and never writes: Git runs with fixed argument arrays
 * and no external diff, text conversion, hooks or clean filters, and file
 * bodies are read with O_NOFOLLOW inside the registered root only. HEAD is not
 * the baseline; the snapshot describes the observed working tree.
 */
export async function captureRepository(
  root: string,
  policy: CapturePolicy,
  options: CaptureOptions = {},
): Promise<RepositorySnapshot> {
  const limits = resolveLimits(options);
  const checked = policySchema.parse(policy);
  const rootPath = resolveRoot(root);
  const warnings: string[] = [];

  const base: Array<[string, string]> = [
    ["core.fsmonitor", "false"],
    ["core.hooksPath", "/dev/null"],
    ["diff.external", ""],
    ["core.attributesFile", "/dev/null"],
  ];
  const probe = createGitRunner(rootPath, base);
  const top = (await probe.require(["rev-parse", "--show-toplevel"])).toString("utf8").trim();
  if (top !== rootPath) throw new Error("Repository root is not a Git work tree root");

  // Git is used for index/HEAD metadata only. No working-tree diff or
  // status command is allowed: those may run filters or follow moved paths.
  const git = createGitRunner(rootPath, [
    ["core.fsmonitor", "false"],
    ["core.hooksPath", "/dev/null"],
    ["diff.external", ""],
    ["core.attributesFile", "/dev/null"],
  ]);
  const format = (await git.require(["rev-parse", "--show-object-format"])).toString("utf8").trim();
  if (format !== "sha1" && format !== "sha256")
    throw new Error("Unsupported repository object format");
  warnings.push(
    "Dirty state compares captured raw bytes with index objects; Git content conversion is never executed.",
  );
  const head = await readHead(git);
  const indexPath = await readIndexPath(git, rootPath);
  const indexIdentity = await readIndexIdentity(indexPath);
  const listing = await readListing(git, head, limits.includeUntracked);
  if (listing.unmerged.size > 0) warnings.push("The repository has unresolved merge conflicts.");
  if (!limits.includeUntracked) warnings.push("Untracked files were not captured.");

  const candidates = buildCandidates(listing);
  const omitted = Math.max(0, candidates.length - limits.maxFiles) + listing.invalid;
  if (omitted > 0)
    warnings.push(
      `${omitted} path(s) exceeded the file limit or could not be named and were omitted.`,
    );
  if (listing.invalid > 0)
    warnings.push(`${listing.invalid} path(s) are not valid UTF-8 and were not captured.`);
  const selected = candidates.slice(0, limits.maxFiles);

  const files: RepositoryFile[] = [];
  let unstaged = 0;
  let budget = limits.maxTotalBytes;
  let excluded = 0;
  let unreadable = 0;
  let overBudget = 0;
  let oversized = 0;
  let deleted = 0;
  let racy = false;

  for (const candidate of selected) {
    const path = redact(candidate.path);
    const base = { path, tracked: candidate.tracked, staged: candidate.staged };
    if (isExcluded(candidate.path, checked)) {
      excluded += 1;
      files.push({
        ...base,
        status: "excluded",
        content: disabledContent(null),
        fingerprint: null,
      });
      continue;
    }
    if (candidate.mode === "160000") {
      // Submodules are recorded as a reference and never traversed.
      files.push({
        ...base,
        status: "submodule",
        content: disabledContent(null),
        fingerprint: null,
      });
      continue;
    }
    if (candidate.mode === "120000") {
      files.push({ ...base, status: "symlink", content: disabledContent(null), fingerprint: null });
      continue;
    }
    if (candidate.deleted) {
      files.push({
        ...base,
        status: "deleted",
        content: unavailableContent(null),
        fingerprint: null,
      });
      continue;
    }
    // Metadata is inspected first so a path is classified before anything is read.
    const inspection = inspectPath(rootPath, candidate.path);
    if (inspection.kind === "missing") {
      if (candidate.tracked) {
        deleted += 1;
      }
      files.push({
        ...base,
        status: "deleted",
        content: unavailableContent(null),
        fingerprint: null,
      });
      continue;
    }
    if (inspection.kind === "symlink") {
      files.push({ ...base, status: "symlink", content: disabledContent(null), fingerprint: null });
      continue;
    }
    if (inspection.kind !== "regular") {
      unreadable += 1;
      files.push({
        ...base,
        status: "unavailable",
        content: unavailableContent(null),
        fingerprint: null,
      });
      continue;
    }
    if (!checked.code) {
      // Metadata only: never open a file body.
      files.push({
        ...base,
        status: "present",
        content: disabledContent(inspection.size),
        fingerprint: null,
      });
      continue;
    }
    if (inspection.size > limits.maxFileBytes) {
      oversized += 1;
      files.push({
        ...base,
        status: "oversized",
        content: unavailableContent(inspection.size),
        fingerprint: null,
      });
      continue;
    }
    if (inspection.size > budget) {
      overBudget += 1;
      files.push({
        ...base,
        status: "unavailable",
        content: unavailableContent(null),
        fingerprint: null,
      });
      continue;
    }
    const read = readRegularFile(rootPath, candidate.path, Math.min(limits.maxFileBytes, budget));
    if (read.kind === "missing") {
      if (candidate.tracked) {
        deleted += 1;
      }
      files.push({
        ...base,
        status: "deleted",
        content: unavailableContent(null),
        fingerprint: null,
      });
      continue;
    }
    if (read.kind === "symlink") {
      files.push({ ...base, status: "symlink", content: disabledContent(null), fingerprint: null });
      continue;
    }
    if (read.kind === "unsafe" || read.kind === "not-regular") {
      unreadable += 1;
      files.push({
        ...base,
        status: "unavailable",
        content: unavailableContent(null),
        fingerprint: null,
      });
      continue;
    }
    if (read.kind === "racy") {
      racy = true;
      files.push({ ...base, status: "racy", content: unavailableContent(null), fingerprint: null });
      continue;
    }
    if (read.kind === "oversized") {
      oversized += 1;
      files.push({
        ...base,
        status: "oversized",
        content: unavailableContent(read.size),
        fingerprint: null,
      });
      continue;
    }
    budget -= read.bytes.length;
    if (candidate.tracked) {
      // This raw hash exists only in memory for equality, never in an artifact.
      const rawIdentity = createHash(format)
        .update(`blob ${read.bytes.length}\0`)
        .update(read.bytes)
        .digest("hex");
      if (rawIdentity !== listing.tracked.get(candidate.path)?.oid) unstaged++;
    }
    const content = decodeContent(read.bytes, read.size, checked);
    files.push({
      ...base,
      status:
        content.state === "unsupported" || content.state === "malformed" ? "binary" : "present",
      content,
      fingerprint: content.text === null ? null : fingerprintOf(content.text),
    });
  }

  if (excluded > 0) warnings.push(`${excluded} path(s) were excluded by policy and were not read.`);
  if (overBudget > 0)
    warnings.push(
      `${overBudget} path(s) were not read because the capture byte budget was exhausted.`,
    );
  if (oversized > 0) warnings.push(`${oversized} path(s) exceeded the per file byte limit.`);
  if (unreadable > 0) warnings.push(`${unreadable} path(s) could not be read safely.`);

  if (!checked.code && listing.tracked.size > 0) {
    warnings.push(
      "Unstaged working tree changes were not detected because content capture is disabled.",
    );
  }
  const knownDirty =
    listing.staged.size > 0 || unstaged > 0 || deleted > 0 || listing.untrackedCount > 0;
  const incompleteStatus =
    (!checked.code && listing.tracked.size > 0) ||
    omitted > 0 ||
    excluded > 0 ||
    oversized > 0 ||
    unreadable > 0 ||
    overBudget > 0 ||
    racy ||
    files.some((file) => file.status === "symlink" || file.status === "submodule");
  const dirty = knownDirty ? true : incompleteStatus ? null : false;
  if (dirty === null)
    warnings.push("Working-tree dirty state is unknown for uncaptured or unsupported content.");

  const headAfter = await readHead(git);
  const indexAfter = await readIndexIdentity(indexPath);
  const listingAfter = await readListing(git, headAfter, limits.includeUntracked);
  if (headAfter !== head) racy = true;
  if (indexAfter !== indexIdentity) racy = true;
  if (!sameListing(listing, listingAfter)) racy = true;
  if (racy)
    warnings.push(
      "The repository changed during capture; this snapshot is not an atomic filesystem view.",
    );

  return {
    id: `snap_${randomUUID()}`,
    capturedAt: new Date().toISOString(),
    head,
    indexIdentity,
    state: racy ? "racy" : "observed",
    dirty,
    files,
    omitted,
    warnings,
  };
}
