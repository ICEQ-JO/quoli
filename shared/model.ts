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

export interface Project {
  /** Stable id: first 12 hex chars of sha256(root). Used in URLs. */
  id: string;
  root: string;
  name: string;
  sessions: number;
  lastActivity: string | null;
  hookStatus: HookStatus;
  /** When the project was connected through Quoli, if it was. */
  connectedAt: string | null;
}

export interface SessionSummary {
  id: string;
  projectId: string;
  root: string;
  title: string;
  branch: string | null;
  startedAt: string;
  endedAt: string | null;
  live: boolean;
  toolCount: number;
  filesTouched: number;
  failures: number;
  tokens: TokenTotals;
  models: string[];
  /** Estimated list-price cost of the reported usage (Increment 2). */
  cost: Cost;
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
}

export interface Turn {
  prompt: string;
  at: string;
  toolCallIds: string[];
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
  lines: number;
  language: string | null;
  imports: string[];
  status: "clean" | "modified" | "added" | "untracked";
}

export interface CodeMap {
  root: string;
  files: CodeFile[];
  truncated: number;
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
}

export interface GitState {
  branches: Branch[];
  commits: Commit[];
  changed: number;
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
  /** The file that told us this service exists. */
  evidence: string;
  metrics: ServiceMetrics | null;
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
export interface Overview {
  live: SessionSummary[];
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
export interface ReviewItem {
  id: string;
  text: string;
  toolCallIds: string[];
  files: string[];
}

export interface SessionReport {
  changes: FileChange[];
  commands: CommandRun[];
  checklist: ReviewItem[];
  /** Cost per model; model null = usage without a model id. */
  costByModel: { model: string | null; tokens: TokenTotals; usd: number | null }[];
  priceVersion: string;
}

/* ---------- Helpers ---------- */

export const zeroTokens = (): TokenTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export const totalTokens = (t: TokenTotals) => t.input + t.output + t.cacheRead + t.cacheWrite;

export function categorize(tool: string): ToolCategory {
  if (/^(Read|NotebookRead|LS)$/.test(tool)) return "read";
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool)) return "edit";
  if (/^(Bash|BashOutput|KillShell)$/.test(tool)) return "run";
  if (/^(Grep|Glob)$/.test(tool)) return "search";
  if (/^(Task|Agent)$/.test(tool)) return "agent";
  if (/^(WebFetch|WebSearch)$/.test(tool) || tool.startsWith("mcp__")) return "web";
  return "other";
}
