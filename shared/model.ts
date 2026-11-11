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

export interface Project {
  root: string;
  name: string;
  sessions: number;
  lastActivity: string | null;
}

export interface SessionSummary {
  id: string;
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
