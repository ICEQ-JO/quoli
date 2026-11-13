import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import type {
  CommandRun,
  FileChange,
  ReviewBranch,
  ReviewCommit,
  ReviewDiff,
  ReviewFile,
  ReviewKind,
  ReviewReason,
  RiskLevel,
  SessionDetail,
  SessionReview,
} from "../shared/model.ts";
import { DIFF_LIMIT } from "./gitstate.ts";
import { git } from "./ingest.ts";

/**
 * The Review lens: which files changed in a session, in what order to read them, and what looks
 * risky. One helper, so the header, the Summary and the lens count the same files (#171).
 * Files come from Git when the repository is on disk and still on the session's branch (the
 * working tree compared with where the session began); otherwise from the agent's recorded edits.
 */

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const SLACK_MS = 10 * 60_000;
const MAX_COMMITS = 50;
const MAX_UNTRACKED_BYTES = 1024 * 1024;
const FILE_LIMIT = 2000;

/* ---------- classification ---------- */

const LOCKFILES =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|Gemfile\.lock|composer\.lock|go\.sum|uv\.lock)$/;
const SCHEMA =
  /\.(sql|prisma)$|(^|\/)(migrations?|db\/migrate|alembic|supabase\/migrations)\/|(^|\/)schema\.[a-z]+$/i;
const TESTS =
  /(^|\/)(tests?|__tests__|spec|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/;
const DOCS = /\.(md|mdx|rst|txt)$|(^|\/)docs?\//i;
const CONFIG =
  /(^|\/)(package\.json|tsconfig[^/]*\.json|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.env[^/]*|Makefile|vercel\.json|biome\.json|\.github\/workflows\/[^/]+|[^/]*\.config\.[cm]?[jt]s|\.[a-z]+rc(\.[a-z]+)?|pnpm-workspace\.yaml|[^/]*\.(toml|ya?ml|ini))$/i;
const CODE =
  /\.(tsx?|jsx?|mjs|cjs|py|go|rs|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|css|scss|html|vue|svelte)$/i;

export function classifyPath(path: string): ReviewKind {
  if (LOCKFILES.test(path)) return "lockfile";
  if (SCHEMA.test(path)) return "schema";
  if (TESTS.test(path)) return "test";
  if (CONFIG.test(path)) return "config";
  if (DOCS.test(path)) return "docs";
  if (CODE.test(path)) return "code";
  return "other";
}

const CONTAINERS = new Set(["packages", "apps", "libs", "services", "modules", "crates"]);

/** Package or top folder a file belongs to. */
export function groupOf(path: string): string {
  const parts = path.split("/");
  if (parts.length === 1) return "(root)";
  if (CONTAINERS.has(parts[0]) && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

/* ---------- risk ---------- */

export interface RiskInput {
  kind: ReviewKind;
  timesEdited: number;
  editedAfterTest: boolean;
  failedAfter: boolean;
  rewritten: boolean;
  noTest: boolean;
  lines: number;
  failedCommand?: string;
  testCommand?: string;
}

export const levelOf = (score: number): RiskLevel =>
  score >= 40 ? "high" : score >= 20 ? "medium" : "low";

/** Points and reasons for one file. The same inputs always give the same score. */
export function scoreRisk(i: RiskInput): {
  score: number;
  level: RiskLevel;
  reasons: ReviewReason[];
} {
  const reasons: ReviewReason[] = [];
  const add = (label: string, text: string, points: number) =>
    reasons.push({ label, text, points });
  if (i.kind === "schema")
    add("schema", "A migration, schema or SQL file; mistakes here are hard to undo", 30);
  if (i.kind === "config")
    add("config", "A configuration file; it can change how everything runs", 15);
  if (i.kind === "lockfile")
    add("lockfile", "A lockfile changed, so dependencies may have changed", 5);
  if (i.failedAfter)
    add(
      "failed run after",
      `${i.failedCommand ? `\`${i.failedCommand}\`` : "A check"} failed after the last edit`,
      25,
    );
  if (i.editedAfterTest)
    add(
      "edited after tests",
      `Edited after the last test run${i.testCommand ? ` (\`${i.testCommand}\`)` : ""}`,
      25,
    );
  if (i.rewritten) add("rewritten", "The whole file was written over an existing file", 15);
  if (i.timesEdited >= 5) add("churn", `Edited ${i.timesEdited} times`, 15);
  else if (i.timesEdited >= 3) add("churn", `Edited ${i.timesEdited} times`, 10);
  if (i.noTest) add("no test", "No test file was touched and no test command was run", 10);
  const size = Math.min(20, Math.floor(i.lines / 20) * 4);
  if (size > 0) add("large", `${i.lines} changed lines`, size);
  let score = reasons.reduce((n, r) => n + r.points, 0);
  // Docs and tests rarely break a build: they stay readable but rank low.
  if (i.kind === "docs" || i.kind === "test") score = Math.floor(score / 2);
  return { score, level: levelOf(score), reasons };
}

/* ---------- git ---------- */

interface Plan {
  head: string | null;
  base: string;
  /** null = the working tree. */
  target: string | null;
  commits: ReviewCommit[];
}

function branchBase(root: string, head: string | null): string | null {
  const exists = (ref: string) => git(root, ["rev-parse", "--verify", "--quiet", ref]) !== null;
  const remoteDefault = git(root, ["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"]);
  const names = [remoteDefault, "main", "master", "origin/main", "origin/master"].filter(
    (n): n is string => !!n,
  );
  return names.find((n) => n.replace(/^origin\//, "") !== head && exists(n)) ?? null;
}

function sessionCommits(
  root: string,
  startedAt: string,
  until: number | null,
): ReviewCommit[] | null {
  const args = [
    "log",
    "--reverse",
    `--since=${Math.floor(Date.parse(startedAt) / 1000)}`,
    ...(until === null ? [] : [`--until=${Math.floor(until / 1000)}`]),
    "-n",
    String(MAX_COMMITS),
    "--format=%H%x09%cI%x09%s",
    "HEAD",
  ];
  const out = git(root, args);
  if (out === null) return null;
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, at, ...subject] = l.split("\t");
      return { sha, at, subject: subject.join("\t") };
    });
}

/** Where the session began and what to compare with, or why Git cannot answer. */
function planFor(
  session: SessionDetail,
  hasRoot: boolean,
): { plan: Plan } | { reason: string; head?: string | null } {
  const root = session.root;
  if (!hasRoot || !existsSync(root))
    return {
      reason: "The repository is not on this computer, so this shows the agent's recorded edits.",
    };
  if (git(root, ["rev-parse", "--git-dir"]) === null)
    return {
      reason: "This folder is not a Git repository, so this shows the agent's recorded edits.",
    };
  const head = git(root, ["symbolic-ref", "--short", "-q", "HEAD"]);
  if (session.branch && head && session.branch !== head)
    return {
      head,
      reason: `The repository is now on ${head}, not ${session.branch} where the session ran, so this shows the agent's recorded edits.`,
    };
  // A session that never sent an end event stops at its last activity; without this, every later
  // commit (other sessions, other people) would be credited to it.
  const end = session.endedAt ?? (session.live ? null : session.lastAt);
  const windowEnd = end ? Date.parse(end) + SLACK_MS : null;
  const commits = sessionCommits(root, session.startedAt, windowEnd);
  if (commits === null)
    return {
      head,
      reason: "Git could not read the history, so this shows the agent's recorded edits.",
    };
  const later =
    windowEnd !== null &&
    (git(root, ["log", "-1", `--since=${Math.floor(windowEnd / 1000)}`, "--format=%H", "HEAD"]) ??
      "") !== "";
  if (later && commits.length === 0)
    return {
      head,
      reason:
        "Newer commits exist and none were made during this session, so this shows the agent's recorded edits.",
    };
  const first = commits[0];
  const base = first
    ? git(root, ["rev-parse", "--verify", "--quiet", `${first.sha}^`]) || EMPTY_TREE
    : "HEAD";
  return { plan: { head, base, target: later ? (commits.at(-1)?.sha ?? null) : null, commits } };
}

interface GitFile {
  status: NonNullable<ReviewFile["status"]>;
  oldPath: string | null;
  added: number | null;
  removed: number | null;
}

const STATUS = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "added",
  T: "modified",
} as const;

/** Files that differ between the plan's base and its target, with Git's line counts. */
function gitFiles(root: string, plan: Plan): Map<string, GitFile> {
  const range = plan.target ? [plan.base, plan.target] : [plan.base];
  const out = new Map<string, GitFile>();
  const names = (
    git(root, ["diff", "--name-status", "-z", "-M", "--relative", ...range]) ?? ""
  ).split("\0");
  for (let i = 0; i < names.length; ) {
    const code = names[i++];
    if (!code) continue;
    const letter = code[0] as keyof typeof STATUS;
    const renamed = letter === "R" || letter === "C";
    const from = renamed ? names[i++] : null;
    const path = names[i++];
    if (path)
      out.set(path, {
        status: STATUS[letter] ?? "modified",
        oldPath: letter === "R" ? from : null,
        added: null,
        removed: null,
      });
  }
  const nums = (git(root, ["diff", "--numstat", "-z", "-M", "--relative", ...range]) ?? "").split(
    "\0",
  );
  for (let i = 0; i < nums.length; i++) {
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(nums[i]);
    if (!m) continue;
    // A rename's path field is empty; the old and new names follow as separate records.
    let path = m[3];
    if (path === "") {
      path = nums[i + 2];
      i += 2;
    }
    const f = out.get(path);
    if (f) {
      f.added = m[1] === "-" ? null : Number(m[1]);
      f.removed = m[2] === "-" ? null : Number(m[2]);
    }
  }
  if (!plan.target) {
    for (const path of (
      git(root, ["ls-files", "--others", "--exclude-standard", "-z"]) ?? ""
    ).split("\0")) {
      if (!path || out.has(path)) continue;
      out.set(path, { status: "added", oldPath: null, ...untrackedLines(join(root, path)) });
    }
  }
  return out;
}

function untrackedLines(full: string): { added: number | null; removed: number | null } {
  try {
    if (statSync(full).size > MAX_UNTRACKED_BYTES) return { added: null, removed: 0 };
    const text = readFileSync(full, "utf8");
    if (text.includes("\0")) return { added: null, removed: null };
    return { added: text === "" ? 0 : text.replace(/\n$/, "").split("\n").length, removed: 0 };
  } catch {
    return { added: null, removed: null };
  }
}

function branchInfo(
  root: string,
  head: string | null,
  commits: ReviewCommit[] | null,
): ReviewBranch {
  const upstream = head
    ? git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
    : null;
  const ahead = upstream ? git(root, ["rev-list", "--count", "@{upstream}..HEAD"]) : null;
  const status = git(root, ["status", "--porcelain"]);
  return {
    head,
    base: branchBase(root, head),
    upstream: upstream || null,
    commits,
    uncommitted: status === null ? null : status.split("\n").filter(Boolean).length,
    unpushed: ahead === null || ahead === "" ? null : Number(ahead),
  };
}

/* ---------- the review ---------- */

const TESTISH = new Set<CommandRun["kind"]>(["test", "typecheck", "lint", "build"]);

export function buildReview(session: SessionDetail, hasRoot = true): SessionReview {
  const { report } = session;
  const root = session.root;
  const found = planFor(session, hasRoot);
  const gitPlan = "plan" in found ? found.plan : null;
  const edits = new Map<string, FileChange>(report.changes.map((c) => [c.path, c]));
  let files = gitPlan ? gitFiles(root, gitPlan) : null;
  // Git sees nothing but the agent recorded edits: they were reverted, committed elsewhere or
  // never reached this disk. List the recorded edits rather than claim nothing changed.
  const gitEmpty = !!files && files.size === 0 && edits.size > 0;
  if (gitEmpty) files = null;
  const plan = gitEmpty ? null : gitPlan;

  // Without a single recorded edit, Git's working tree would credit the session with changes
  // that were already there; changes made only through commands are not attributed.
  const unattributed = !!files && edits.size === 0;
  const paths = unattributed ? [] : files ? [...files.keys()] : [...edits.keys()];
  const noNetChange = files ? [...edits.keys()].filter((p) => !files.has(p)) : [];

  const callAt = new Map(session.toolCalls.map((c) => [c.id, c.startedAt]));
  const commands = report.commands;
  const lastTest = commands.findLast((c) => c.kind === "test") ?? null;
  const tests = {
    touched: paths.filter((p) => classifyPath(p) === "test"),
    ran: lastTest !== null,
    lastRun: lastTest
      ? lastTest.status === "failed"
        ? ("failed" as const)
        : ("ok" as const)
      : null,
  };

  const rows: ReviewFile[] = paths.slice(0, FILE_LIMIT).map((path) => {
    const g = files?.get(path) ?? null;
    const e = edits.get(path) ?? null;
    const kind = classifyPath(path);
    const times = e?.toolCallIds.length ?? 0;
    const lastEditAt = e
      ? (e.toolCallIds
          .map((id) => callAt.get(id) ?? "")
          .sort()
          .at(-1) ?? "")
      : "";
    const after = e ? commands.filter((c) => c.at > lastEditAt) : [];
    const failed = after.find(
      (c, i) =>
        c.status === "failed" &&
        TESTISH.has(c.kind) &&
        !after.slice(i + 1).some((o) => o.command.trim() === c.command.trim() && o.status === "ok"),
    );
    const editedAfterTest = !!(e && lastTest && lastTest.at < lastEditAt && kind !== "docs");
    const rewritten = !!(e?.rewrite && g?.status === "modified");
    const isSource = kind === "code";
    const noTest = isSource && tests.touched.length === 0 && !tests.ran;
    const added = g ? g.added : (e?.added ?? 0);
    const removed = g ? g.removed : (e?.removed ?? 0);
    const risk = scoreRisk({
      kind,
      timesEdited: times,
      editedAfterTest,
      failedAfter: !!failed,
      rewritten,
      noTest,
      lines: (added ?? 0) + (removed ?? 0),
      failedCommand: failed?.command.split("\n")[0].slice(0, 60),
      testCommand: lastTest?.command.split("\n")[0].slice(0, 60),
    });
    const turnIndexes = e
      ? session.turns.flatMap((t, i) =>
          t.toolCallIds.some((id) => e.toolCallIds.includes(id)) ? [i] : [],
        )
      : [];
    return {
      path,
      group: groupOf(path),
      status: g?.status ?? null,
      oldPath: g?.oldPath ?? null,
      added,
      removed,
      editAdded: e ? e.added : null,
      editRemoved: e ? e.removed : null,
      timesEdited: times,
      outsideEdits: !e,
      editedAfterTest,
      failedAfter: !!failed,
      rewritten,
      kind,
      noTest,
      risk: risk.score,
      level: risk.level,
      reasons: risk.reasons,
      toolCallIds: e?.toolCallIds ?? [],
      turnIndexes,
      after: after.slice(0, 4),
      functions: null,
    };
  });
  rows.sort(
    (a, b) =>
      b.risk - a.risk ||
      (b.added ?? 0) + (b.removed ?? 0) - ((a.added ?? 0) + (a.removed ?? 0)) ||
      a.path.localeCompare(b.path),
  );

  const gitHead = "plan" in found ? found.plan.head : (found.head ?? null);
  const repoReadable =
    hasRoot && existsSync(root) && git(root, ["rev-parse", "--git-dir"]) !== null;
  const branch = repoReadable ? branchInfo(root, gitHead, gitPlan ? gitPlan.commits : null) : null;
  if (branch && gitPlan?.target) {
    branch.uncommitted = null;
    branch.unpushed = null;
  }
  return {
    source: plan ? "git" : "edits",
    note:
      "reason" in found
        ? found.reason
        : gitEmpty
          ? "Git shows no difference for the files the agent edited (reverted, committed on another branch, or not on this disk), so this lists the agent's recorded edits."
          : unattributed
            ? "No file edits were recorded. Changes made only through commands are not attributed to a session."
            : null,
    files: rows,
    noNetChange,
    added: rows.reduce((n, f) => n + (f.added ?? 0), 0),
    removed: rows.reduce((n, f) => n + (f.removed ?? 0), 0),
    tests,
    branch,
  };
}

/** Git diff and current content of one reviewed file. `path` must be a file in the review. */
export function reviewDiff(
  session: SessionDetail,
  path: string,
  hasRoot = true,
): ReviewDiff | null {
  const root = session.root;
  if (!hasRoot || !existsSync(root)) return null;
  const found = planFor(session, hasRoot);
  const plan = "plan" in found ? found.plan : null;
  let gitDiff: string | null = null;
  if (plan) {
    const range = plan.target ? [plan.base, plan.target] : [plan.base];
    gitDiff = git(root, ["diff", "--no-color", "-M", "--relative", ...range, "--", path]) || null;
    if (gitDiff === null && !plan.target) {
      const text = readInside(root, path);
      if (text !== null && git(root, ["ls-files", "--error-unmatch", "--", path]) === null) {
        const lines = text.replace(/\n$/, "").split("\n");
        gitDiff = `@@ new file, ${lines.length} lines @@\n${lines.map((l) => `+${l}`).join("\n")}`;
      }
    }
  }
  const source = readInside(root, path);
  const truncated = (gitDiff?.length ?? 0) > DIFF_LIMIT;
  return {
    path,
    gitDiff: gitDiff && truncated ? gitDiff.slice(0, DIFF_LIMIT) : gitDiff,
    source,
    truncated,
  };
}

/** A file's text only when its real location is inside the repository (no symlink escapes). */
function readInside(root: string, path: string): string | null {
  try {
    const real = realpathSync(join(root, path));
    if (!real.startsWith(realpathSync(root) + sep)) return null;
    return readText(real);
  } catch {
    return null;
  }
}

function readText(full: string): string | null {
  try {
    if (statSync(full).size >= MAX_UNTRACKED_BYTES) return null;
    const text = readFileSync(full, "utf8");
    return text.includes("\0") ? null : text;
  } catch {
    return null;
  }
}
