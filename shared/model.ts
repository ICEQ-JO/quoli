/**
 * Quoli's shared language.
 *
 * Every lens (Agents, Code, Git, Infra) draws from this one vocabulary, so a
 * selection made in one lens means the same thing in every other lens.
 * Every fact carries a basis:
 *   recorded – reported by the agent or a tool (a hook payload, a transcript line)
 *   derived  – computed deterministically from recorded facts or the repository
 *   inferred – a best guess from conventions (e.g. a `pg` dependency implies Postgres)
 */
export type Basis = "recorded" | "derived" | "inferred";

/**
 * Whether Claude Code is wired to this project:
 *   receiving     – Quoli's hooks are installed and at least one event has arrived
 *   installed     – hooks are installed but no event has arrived yet
 *   not_connected – hooks are not installed (past sessions may still be stored)
 */
export type HookStatus = "receiving" | "installed" | "not_connected";

/** One agent's user-level install (`pnpm quoli-setup`, or Projects → Record every repository). */
export interface SetupStatus {
  agent: AgentKind;
  /** The agent's user-level folder exists, so it has been used on this machine. */
  found: boolean;
  installed: boolean;
  file: string;
}

export interface Project {
  /** Stable id: first 12 hex chars of sha256(root). Used in URLs. */
  id: string;
  /** Id of the project this Git worktree belongs to (it is listed under it); null otherwise. */
  worktreeOf?: string | null;
  root: string;
  name: string;
  sessions: number;
  lastActivity: string | null;
  hookStatus: HookStatus;
  /**
   * Agents whose hooks are installed in the repository, and whether each has sent an event yet.
   * Codex runs project hooks only after the user trusts them with /hooks.
   */
  agents: {
    agent: AgentKind;
    status: "receiving" | "installed";
    /** Recorded through the user-level install (every repository), not hooks in this one. */
    everywhere: boolean;
  }[];
  /** When the project was connected through Quoli, if it was. */
  connectedAt: string | null;
  /** `owner/repo` when the repository's origin remote is on GitHub. */
  github: string | null;
}

/** The coding agents Quoli can record. Events without an agent stamp are Claude Code's. */
export type AgentKind = "claude-code" | "codex" | "opencode" | "pi";

export const AGENT_KINDS: AgentKind[] = ["claude-code", "codex", "opencode", "pi"];

export const AGENT_NAMES: Record<AgentKind, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  pi: "Pi",
};

export const isAgentKind = (v: unknown): v is AgentKind =>
  typeof v === "string" && (AGENT_KINDS as string[]).includes(v);

export interface SessionSummary {
  id: string;
  /** Which coding agent produced the session (recorded by its adapter). */
  agent: AgentKind;
  /** The agent's version when it reported one; null otherwise. */
  agentVersion: string | null;
  projectId: string;
  root: string;
  title: string;
  branch: string | null;
  startedAt: string;
  endedAt: string | null;
  /** The last recorded event or usage; a session that never sent an end event ends here. */
  lastAt: string;
  live: boolean;
  toolCount: number;
  filesTouched: number;
  failures: number;
  /** How many loop findings the session has (report.loops), for lists and filters. */
  loops: number;
  tokens: TokenTotals;
  models: string[];
  /** Estimated list-price cost of the reported usage (Increment 2). */
  cost: Cost;
  /**
   * The activity trace: one character per tool call in time order (first 400), see TRACE_CODES.
   * Derived from recorded tool calls.
   */
  trace: string;
}

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** One agent in a session: the main agent or a subagent it spawned. */
export interface AgentNode {
  id: string;
  kind: "main" | "subagent";
  type: string | null;
  parentToolUseId: string | null;
  tokens: TokenTotals;
}

export type ToolCategory = "read" | "edit" | "run" | "search" | "agent" | "web" | "other";
export const CATEGORY_ORDER: ToolCategory[] = [
  "read",
  "edit",
  "run",
  "search",
  "agent",
  "web",
  "other",
];

export interface ToolCall {
  id: string;
  agentId: string;
  name: string;
  category: ToolCategory;
  startedAt: string;
  endedAt: string | null;
  status: "running" | "ok" | "failed";
  /** One human line describing the call (a path, a command, a pattern). */
  summary: string;
  files: string[];
  input: unknown;
  output: string | null;
  /** The MCP server as Claude Code reports it (v2.1.274+); absent otherwise. */
  mcpServer?: { name: string; source: string | null } | null;
}

/** An MCP server, skill or subagent type the session called (#135). Derived from tool calls. */
export interface Extension {
  kind: "mcp" | "skill" | "subagent";
  name: string;
  /** The plugin that provides it, when the agent says so; null otherwise. */
  plugin: string | null;
  calls: number;
  failures: number;
  /** MCP tools used on this server, in first-use order. */
  tools: string[];
  toolCallIds: string[];
}

export interface Turn {
  prompt: string;
  at: string;
  toolCallIds: string[];
  /**
   * The agent's final reply for this prompt, recorded from the turn's end (`last_assistant_message`
   * on Stop). Null when the agent reported none.
   */
  reply: string | null;
}

export interface SessionDetail extends SessionSummary {
  agents: AgentNode[];
  turns: Turn[];
  toolCalls: ToolCall[];
  /** Repo-relative path → how the session touched it. */
  files: Record<string, FileTouch>;
  usage: UsagePoint[];
  /** What the Summary tab shows (Increment 2). All derived from recorded events. */
  report: SessionReport;
}

export interface FileTouch {
  read: number;
  edited: number;
  toolCallIds: string[];
}

export interface UsagePoint {
  at: string;
  agentId: string;
  model: string | null;
  tokens: TokenTotals;
}

/* ---------- Code ---------- */

export interface CodeFile {
  path: string;
  /** Line count; 0 when the file was not scanned (see `scanned`). */
  lines: number;
  language: string | null;
  imports: string[];
  /** False when contents were not read (unknown type, over 512 KB, or over the scan budget). */
  scanned: boolean;
  status: "clean" | "modified" | "added" | "untracked";
  /** Uncommitted lines added/removed against HEAD (`git diff --numstat`); null when clean or binary. */
  diff: { added: number; removed: number } | null;
}

export interface CodeMap {
  root: string;
  files: CodeFile[];
  /** Paths beyond the listing cap that are not in `files`. */
  truncated: number;
}

/* ---------- Code graph (functions, imports, calls) ---------- */

export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "component"
  | "variable-function"
  | "module";

export interface CodeSymbol {
  /** Stable: `<path>#<qualifiedName>`. Top-level statements are `<path>#<module>` (kind "module"). */
  id: string;
  file: string;
  name: string;
  /** `OrderService.create` for a method; equal to `name` for top-level symbols. */
  qualifiedName: string;
  kind: SymbolKind;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  exported: boolean;
}

/**
 * `import`: file path to file path, always `resolved`. `call`: caller symbol id to callee symbol id.
 * `possible` means the callee was matched only by method name (at most 3 candidates); calls that
 * cannot be tied to a file of the repository (libraries, runtime) have no edge.
 */
export interface CodeEdge {
  from: string;
  to: string;
  kind: "import" | "call" | "route" | "query";
  certainty: "resolved" | "possible";
}

/** An HTTP route. A `route` edge goes from the route id to its handler symbol id. */
export interface CodeRoute {
  id: string;
  method: string;
  path: string;
  framework: string;
  file: string;
  line: number;
  handler: string | null;
}

/** A database table. A `query` edge goes from a symbol id to the table id. */
export interface CodeTable {
  id: string;
  name: string;
  source: string;
  file: string;
  line: number;
  columns: {
    name: string;
    type: string | null;
    pk: boolean;
    references: { table: string; column: string | null } | null;
  }[];
}

export interface CodeGraphFile {
  path: string;
  language: string;
  lines: number;
}

export interface Stack {
  /** Programming languages by number of files; `share` is files / all files of these languages. */
  languages: { name: string; files: number; share: number }[];
  /** `evidence` is the manifest the dependency was read from. */
  frameworks: { name: string; version: string | null; package: string | null; evidence: string }[];
  packages: { name: string; path: string; framework: string | null }[];
}

export interface CodeGraph {
  commit: string | null;
  generatedAt: string;
  stack: Stack;
  files: CodeGraphFile[];
  symbols: CodeSymbol[];
  edges: CodeEdge[];
  routes?: CodeRoute[];
  tables?: CodeTable[];
  /** True when more source files exist than the scan limit. */
  truncated: boolean;
  stats: {
    files: number;
    symbols: number;
    imports: number;
    calls: number;
    possibleCalls: number;
    /** Files parsed in this build; the rest came from the cache. */
    parsed: number;
    cached: number;
    /** Source files skipped: too large, generated or minified. */
    skipped: number;
    ms: number;
  };
}

export interface EventHit {
  kind: "prompt" | "command" | "error";
  sessionId: string;
  sessionTitle: string;
  /** The tool call to open; for a prompt, the first call it made (null when it made none). */
  callId: string | null;
  text: string;
  at: string;
}

/* ---------- Git ---------- */

export interface Branch {
  name: string;
  current: boolean;
  head: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastCommitAt: string;
}

export interface Commit {
  sha: string;
  parents: string[];
  subject: string;
  author: string;
  at: string;
  refs: string[];
  /** Recorded sessions whose `git commit` tool output reported creating this commit. */
  sessions?: string[];
}

export interface Remote {
  name: string;
  /** `host/owner/repo`, never credentials. Null when the URL could not be read as a host path. */
  display: string | null;
  /** Browser link for GitHub, GitLab and Bitbucket remotes; null for anything else. */
  web: string | null;
}

export interface CommitFile {
  path: string;
  /** Null for binary files. */
  added: number | null;
  removed: number | null;
}

export interface CommitDetail {
  sha: string;
  files: CommitFile[];
  /** Unified diff, clipped to `DIFF_LIMIT` characters; null when git could not produce it. */
  diff: string | null;
  truncated: boolean;
}

export interface GitState {
  branches: Branch[];
  remotes: Remote[];
  /** When remote-tracking refs were last updated by a fetch (FETCH_HEAD mtime); null if never. */
  lastFetch: string | null;
  /** Newest first, in `--topo-order` (children before parents) so lanes are stable. */
  commits: Commit[];
  changed: number;
  /** True when older commits exist beyond the requested `limit`. */
  hasMore: boolean;
}

/* ---------- Infra ---------- */

export type ServiceKind =
  | "web"
  | "api"
  | "worker"
  | "database"
  | "cache"
  | "queue"
  | "container"
  | "function"
  | "pipeline"
  | "external";

export interface Service {
  id: string;
  name: string;
  kind: ServiceKind;
  /** Where it runs, e.g. "docker-compose", "vercel", "fly.io", "github-actions". */
  platform: string;
  /** Repo-relative directory whose code this service runs, when known. */
  sourceDir: string | null;
  ports: string[];
  basis: Basis;
  /** The file that told us this service exists, or "added by you" for a service added by hand. */
  evidence: string;
  metrics: ServiceMetrics | null;
  /** Dashboard link the user gave; Quoli never fetches it. */
  url: string | null;
  /** Id of the hand-made entry that added or edits this service; null when none does. */
  manual: string | null;
}

/**
 * A service the user added or edited by hand. Stored locally per project; no credentials,
 * no connection, so it never carries live status or metrics.
 */
export interface ManualService {
  id: string;
  /** Detected service this entry renames or links; null for a service added from scratch. */
  of: string | null;
  name: string;
  kind: ServiceKind;
  /** A provider id from shared/providers.ts or free text for any other host. */
  provider: string;
  url: string | null;
  sourceDir: string | null;
}

export interface ServiceMetrics {
  state: string;
  cpuPercent: number | null;
  memoryBytes: number | null;
  source: string;
}

export interface Link {
  from: string;
  to: string;
  kind: "depends_on" | "deploys" | "calls";
  basis: Basis;
}

export interface InfraMap {
  services: Service[];
  links: Link[];
}

/* ---------- App (Increment 1) ---------- */

/** GET /api/overview — what the Home page shows, across all projects. */
/** A running session as the live panel shows it (GET /api/overview). All derived. */
export interface LiveSession extends SessionSummary {
  /** The running call, or else the most recent one; null before the first call. */
  step: Pick<ToolCall, "name" | "category" | "summary" | "status" | "startedAt"> | null;
  /** Estimated spend of usage recorded in the last 10 minutes; null when none was priced. */
  recentUsd: number | null;
}

export interface Overview {
  live: LiveSession[];
  /** Derived; each reason is a plain sentence, e.g. "2 failed tool calls". */
  needsReview: { session: SessionSummary; reasons: string[] }[];
  /** Most recent sessions first, at most 10. */
  recent: SessionSummary[];
  /** Calendar day / last 7 days in the server's local time. */
  tokens: { today: TokenTotals; week: TokenTotals };
  cost: { today: Cost; week: Cost };
  counts: { projects: number; sessions: number; sessionsToday: number };
}

/** User settings, stored in SQLite. GET/PUT /api/settings. */
export interface Settings {
  /** Delete whole sessions whose last event is older than this; null keeps everything. */
  retentionDays: number | null;
  /** Redact common credential shapes before storing events. */
  redact: boolean;
  /** Local spend budgets in USD (estimates); null = none. They only change what the UI shows. */
  budgetDailyUsd: number | null;
  budgetMonthlyUsd: number | null;
  /** Fetch current model prices from models.dev once a day (GET /api/prices/live). */
  livePrices: boolean;
}

/** Team sync (GET/PUT /api/sync): summaries only, never the sync key. */
export interface SyncStatus {
  enabled: boolean;
  /** This build knows a hosted class service to send to. */
  available: boolean;
  hasKey: boolean;
  /** Only sessions that started after this are sent. */
  since: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Summaries sent so far (an updated session counts again). */
  sent: number;
  /** A browser approval started from Settings (POST /api/sync/connect), until it completes. */
  linking?: { pair: string; url: string; error: string | null } | null;
}

/** Live prices from models.dev: used for models the price table does not have. */
export interface LivePriceStatus {
  enabled: boolean;
  source: string;
  /** When the prices in use were fetched; null before the first fetch. */
  fetchedAt: string | null;
  models: number;
  /** Why the last fetch failed, when it did; the previous prices stay in use. */
  error: string | null;
}

/** Read-only facts about this Quoli install, returned with settings. */
export interface ServerInfo {
  dataDir: string;
  port: number;
  version: string;
}

/* ---------- Summary and cost (Increment 2) ---------- */

/** USD per million tokens. `model` matches a usage model id exactly or as a prefix (date suffixes). */
export interface ModelPrice {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** User-editable list prices. GET/PUT /api/prices. Costs are estimates, never invoices. */
export interface PriceTable {
  /** Free-form label of the table's source, e.g. "list prices 2026-11-03". */
  version: string;
  currency: "USD";
  prices: ModelPrice[];
}

export interface Cost {
  /** Sum over priced usage; null when nothing could be priced. */
  usd: number | null;
  /** Model ids that appeared in usage but matched no price (their tokens are excluded from usd). */
  unpriced: string[];
}

/** A file the session changed, counted from the recorded Edit/MultiEdit/Write inputs. */
export interface FileChange {
  path: string;
  added: number;
  removed: number;
  /** True when a Write replaced the whole file, so removed lines are unknown. */
  rewrite: boolean;
  toolCallIds: string[];
}

export interface CommandRun {
  toolCallId: string;
  command: string;
  /** Classified from the command text, e.g. "npm test" → test. */
  kind: "test" | "build" | "lint" | "typecheck" | "other";
  status: ToolCall["status"];
  at: string;
}

/** A derived review prompt. Never a claim that something works. */
/** A possible loop or failure pattern (inferred by a stated rule; see server/loops.ts). */
export interface LoopFinding {
  id: string;
  kind: "repeated-failure" | "edit-churn" | "error-streak" | "stall";
  text: string;
  /** The rule that fired, in words. */
  rule: string;
  toolCallIds: string[];
  files: string[];
}

export interface ReviewItem {
  id: string;
  text: string;
  toolCallIds: string[];
  files: string[];
}

/** One prompt and what followed it, until the next prompt (derived; see server/steps.ts). */
export interface TurnStat {
  /** Index into SessionDetail.turns. */
  index: number;
  at: string;
  endAt: string;
  /** Prompt to next prompt (or the session's last event). */
  ms: number;
  calls: number;
  failures: number;
  /** Time with at least one of the turn's tool calls running; parallel calls count once. */
  toolMs: number;
  /** Usage whose time falls in the turn (usage is per model request, not per call). */
  tokens: TokenTotals;
  cost: Cost;
}

export interface SessionReport {
  changes: FileChange[];
  commands: CommandRun[];
  checklist: ReviewItem[];
  /** Per prompt: time, calls, failures, tokens and estimated cost. */
  turns: TurnStat[];
  /** Possible loops and failure patterns, inferred by rule. */
  loops: LoopFinding[];
  /** MCP servers, skills and subagent types the session called. */
  extensions: Extension[];
  /** The longest finished tool calls, longest first (up to 5). */
  slowest: { toolCallId: string; ms: number }[];
  /** Cost per model; model null = usage without a model id. */
  costByModel: { model: string | null; tokens: TokenTotals; usd: number | null }[];
  priceVersion: string;
}

/* ---------- Review lens (#171) ---------- */

/** A function or class a file's change touches. Filled by the code engine; null until it exists. */
export interface ChangedSymbol {
  name: string;
  kind: string;
  change: "added" | "modified" | "removed";
}

export type ReviewKind = "code" | "test" | "docs" | "config" | "schema" | "lockfile" | "other";
export type RiskLevel = "high" | "medium" | "low";

export interface ReviewReason {
  /** Short word for a chip, e.g. "edited after tests". */
  label: string;
  /** The same finding as a sentence. */
  text: string;
  points: number;
}

export interface ReviewFile {
  path: string;
  /** Package or top folder: "packages/api", "server", "(root)". */
  group: string;
  /** Git status against where the session started; null when only recorded edits are known. */
  status: "added" | "modified" | "deleted" | "renamed" | null;
  oldPath: string | null;
  /** Lines from Git when the review is Git-based (null for binary files), else from recorded edits. */
  added: number | null;
  removed: number | null;
  /** Lines counted from the agent's recorded edit inputs; null when it did not edit this file. */
  editAdded: number | null;
  editRemoved: number | null;
  /** Edit calls the agent made to this file. */
  timesEdited: number;
  /** The agent has no recorded edit for this file (Git sees a change another tool or person made). */
  outsideEdits: boolean;
  editedAfterTest: boolean;
  failedAfter: boolean;
  /** A Write replaced a file that existed before. */
  rewritten: boolean;
  kind: ReviewKind;
  /** A source file, with no test file touched and no test command run in the session. */
  noTest: boolean;
  risk: number;
  level: RiskLevel;
  reasons: ReviewReason[];
  toolCallIds: string[];
  /** Indexes into SessionDetail.turns of the prompts that led to edits of this file. */
  turnIndexes: number[];
  /** Commands that ran after the file's last edit (up to 4). */
  after: CommandRun[];
  /** Function-level changes; null until the code engine provides them. */
  functions: ChangedSymbol[] | null;
}

export interface ReviewCommit {
  sha: string;
  subject: string;
  at: string;
}

export interface ReviewBranch {
  head: string | null;
  /** main / master / the remote's default, when it is not the branch itself. */
  base: string | null;
  upstream: string | null;
  /** Commits made while the session ran; null when they could not be read. */
  commits: ReviewCommit[] | null;
  uncommitted: number | null;
  unpushed: number | null;
}

export interface SessionReview {
  /** git: files come from Git; edits: only the agent's recorded edits are known. */
  source: "git" | "edits";
  /** Why Git was not used, or another caveat. */
  note: string | null;
  files: ReviewFile[];
  /** Recorded edits whose file shows no net change in Git (reverted or ignored). */
  noNetChange: string[];
  added: number;
  removed: number;
  tests: { touched: string[]; ran: boolean; lastRun: "ok" | "failed" | null };
  branch: ReviewBranch | null;
}

/** One file's diff and content for the Review lens. */
export interface ReviewDiff {
  path: string;
  gitDiff: string | null;
  source: string | null;
  truncated: boolean;
}

/* ---------- Usage (redesign R1) ---------- */

/** One calendar day in the server's local time zone. */
export interface UsageDay {
  /** YYYY-MM-DD */
  date: string;
  tokens: TokenTotals;
  /** Estimated cost of priced usage that day; null when nothing could be priced. */
  usd: number | null;
}

/** One group of sessions in Insights (an agent or a main model). */
export interface InsightsGroup {
  key: string;
  label: string;
  sessions: number;
  calls: number;
  failures: number;
  loops: number;
  /** Median cost per session, over sessions whose every model has a price. */
  medianUsd: number | null;
  /** Median duration, over sessions that are not live. */
  medianMs: number | null;
}

/** GET /api/insights — trends across sessions, bucketed by the local day each session started. */
export interface InsightsReport {
  days: {
    date: string;
    sessions: number;
    /** Sessions whose cost is partly or wholly unknown; left out of the cost figures. */
    unpricedSessions: number;
    medianUsd: number | null;
    p90Usd: number | null;
    calls: number;
    failures: number;
    loops: number;
    mix: Record<ToolCategory, number>;
  }[];
  total: {
    sessions: number;
    calls: number;
    failures: number;
    loops: number;
    sessionsWithLoops: number;
    unpricedSessions: number;
    medianUsd: number | null;
    p90Usd: number | null;
    medianMs: number | null;
    p90Ms: number | null;
  };
  durations: { label: string; sessions: number }[];
  byAgent: InsightsGroup[];
  /** Grouped by each session's main model (the one that used the most tokens). */
  byModel: InsightsGroup[];
  /** Every model seen in the range, for the filter. */
  models: string[];
  /** MCP servers, skills and subagent types across the sessions, most called first (max 20). */
  extensions: (Pick<Extension, "kind" | "name" | "plugin" | "calls" | "failures"> & {
    sessions: number;
  })[];
}

/** GET /api/usage?days=N — spend and tokens over the last N days (1–365), all derived from usage rows. */
export interface UsageReport {
  days: UsageDay[];
  total: { tokens: TokenTotals; cost: Cost };
  byModel: { model: string | null; tokens: TokenTotals; usd: number | null }[];
  byProject: {
    projectId: string;
    name: string;
    root: string;
    tokens: TokenTotals;
    usd: number | null;
  }[];
  /** Most expensive sessions in the range, at most 10. */
  topSessions: {
    id: string;
    projectId: string;
    title: string;
    startedAt: string;
    tokens: TokenTotals;
    usd: number | null;
  }[];
  /** What cache reads saved versus paying the input price for the same tokens (priced models only). */
  cacheSavingsUsd: number | null;
  /** Spend so far today and this calendar month, for the budgets. */
  spend: { today: number | null; month: number | null };
}

/* ---------- Helpers ---------- */

/** Trace characters per tool category; a failed call is "f" whatever its category. */
export const TRACE_CODES: Record<ToolCategory, string> = {
  read: "r",
  edit: "e",
  run: "c",
  search: "s",
  agent: "a",
  web: "w",
  other: "o",
};

export const zeroTokens = (): TokenTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export const totalTokens = (t: TokenTotals) => t.input + t.output + t.cacheRead + t.cacheWrite;

/**
 * Tool names from every supported agent, lower-cased, mapped onto the shared categories.
 * Claude Code uses PascalCase (Read, Edit, Bash), Codex snake_case (apply_patch, exec_command),
 * OpenCode lower case (read, edit, bash). The original name stays on the tool call.
 */
const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // read
  read: "read",
  notebookread: "read",
  ls: "read",
  list: "read",
  read_file: "read",
  view_image: "read",
  // edit
  edit: "edit",
  multiedit: "edit",
  write: "edit",
  notebookedit: "edit",
  apply_patch: "edit",
  patch: "edit",
  // run
  bash: "run",
  bashoutput: "run",
  killshell: "run",
  shell: "run",
  local_shell: "run",
  exec_command: "run",
  unified_exec: "run",
  write_stdin: "run",
  // search
  grep: "search",
  glob: "search",
  codesearch: "search",
  file_search: "search",
  find: "search",
  // agent
  task: "agent",
  agent: "agent",
  spawn_agent: "agent",
  // web
  webfetch: "web",
  websearch: "web",
  web_search: "web",
};

export function categorize(tool: string): ToolCategory {
  if (tool.startsWith("mcp__")) return "web";
  return TOOL_CATEGORIES[tool.toLowerCase()] ?? "other";
}
