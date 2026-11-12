import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./db.ts";
import { git } from "./ingest.ts";

/**
 * `pnpm connect <repo>` adds Quoli's hook to <repo>/.claude/settings.local.json
 * (machine-local, not committed); `--agent codex` adds it to <repo>/.codex/hooks.json instead,
 * which is kept out of Git through .git/info/exclude. `--remove` takes it out again. Other
 * hooks in those files are kept.
 */
export type HookAgent = "claude-code" | "codex";
export const HOOK_AGENTS: HookAgent[] = ["claude-code", "codex"];

const TARGETS: Record<HookAgent, { file: string; events: string[] }> = {
  "claude-code": {
    file: join(".claude", "settings.local.json"),
    events: [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "SubagentStart",
      "SubagentStop",
      "Stop",
      "SessionEnd",
    ],
  },
  // Codex hook contract: learn.chatgpt.com/docs/hooks (verified against codex-cli 0.163.0).
  codex: {
    file: join(".codex", "hooks.json"),
    events: [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "SubagentStart",
      "SubagentStop",
      "PostModelRequest",
      "Stop",
      "SessionEnd",
    ],
  },
};

const hook = join(dirname(fileURLToPath(import.meta.url)), "hook.mjs");
const commandFor = (agent: HookAgent) =>
  `"${process.execPath}" "${hook}" ${Number(process.env.QUOLI_PORT ?? 4400)}${agent === "claude-code" ? "" : ` ${agent}`}`;
const isOurs = (group: { hooks?: { command?: string }[] }) =>
  group.hooks?.some((h) => h.command?.includes("server/hook.mjs")) ?? false;

const settingsFile = (repo: string, agent: HookAgent = "claude-code") =>
  join(resolve(repo), TARGETS[agent].file);

function ourCommands(root: string, agent: HookAgent): string[] | null {
  let settings: { hooks?: Record<string, unknown> };
  try {
    settings = JSON.parse(readFileSync(settingsFile(root, agent), "utf8"));
  } catch {
    return null;
  }
  return Object.values(settings?.hooks ?? {})
    .flatMap((groups) => (Array.isArray(groups) ? groups : []))
    .filter(isOurs)
    .flatMap((g) => g.hooks ?? [])
    .map((h: { command?: string }) => h.command ?? "");
}

/** The agents whose hook files in `root` contain Quoli's hook. */
export function installedAgents(root: string): HookAgent[] {
  return HOOK_AGENTS.filter((a) => (ourCommands(root, a)?.length ?? 0) > 0);
}

/** True when Quoli's hook is present for any agent. */
export function hooksInstalled(root: string): boolean {
  return installedAgents(root).length > 0;
}

/**
 * Rewrites Quoli's hook in projects that have it installed but point at another port or
 * another Quoli checkout, which would silently stop events. Returns the roots it updated.
 */
export function refreshHooks(roots: string[]): string[] {
  const updated: string[] = [];
  for (const root of roots) {
    let changed = false;
    for (const agent of HOOK_AGENTS) {
      const ours = ourCommands(root, agent);
      if (!ours?.length || ours.every((c) => c === commandFor(agent))) continue;
      try {
        connect(root, false, agent);
        changed = true;
      } catch {}
    }
    if (changed) updated.push(root);
  }
  return updated;
}

/** The repository's real top-level directory, or throws a human-readable error. */
export function validateRepo(path: unknown): string {
  if (typeof path !== "string" || !isAbsolute(path)) throw new Error("Path must be absolute");
  if (!existsSync(path)) throw new Error("Path does not exist");
  const real = realpathSync(path);
  const top = git(real, ["rev-parse", "--show-toplevel"]);
  if (!top) throw new Error("Not a git repository");
  if (realpathSync(top) !== real) {
    throw new Error(`Not the repository top level; use ${realpathSync(top)}`);
  }
  return real;
}

export function connect(repo: string, remove = false, agent: HookAgent = "claude-code") {
  const file = settingsFile(repo, agent);
  if (remove && !existsSync(file)) return file;
  const settings = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const hooks: Record<string, { hooks?: { command?: string }[] }[]> = settings.hooks ?? {};
  // Codex caps SessionEnd hooks at 3 seconds; the forwarder gives up after 1.5.
  const handler = {
    type: "command",
    command: commandFor(agent),
    ...(agent === "codex" ? { timeout: 3 } : {}),
  };
  for (const event of TARGETS[agent].events) {
    const kept = (hooks[event] ?? []).filter((g) => !isOurs(g));
    hooks[event] = remove ? kept : [...kept, { hooks: [handler as never] }];
    if (!hooks[event].length) delete hooks[event];
  }
  settings.hooks = hooks;
  if (!Object.keys(hooks).length) delete settings.hooks;
  if (agent === "codex" && remove && !Object.keys(settings).length) {
    rmSync(file);
    return file;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  if (agent === "codex" && !remove) excludeFromGit(repo, TARGETS.codex.file);
  return file;
}

/** Codex's project hook file lives in the repo; keep it out of commits like settings.local.json. */
function excludeFromGit(repo: string, rel: string) {
  const path = git(repo, ["rev-parse", "--git-path", "info/exclude"]);
  if (!path) return;
  const exclude = isAbsolute(path) ? path : join(resolve(repo), path);
  const entry = `/${rel.split("\\").join("/")}`;
  const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (current.split("\n").some((l) => l.trim() === entry)) return;
  mkdirSync(dirname(exclude), { recursive: true });
  writeFileSync(exclude, `${current}${current && !current.endsWith("\n") ? "\n" : ""}${entry}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const agentAt = args.indexOf("--agent");
  const agent = (agentAt >= 0 ? args[agentAt + 1] : "claude-code") as HookAgent;
  const repo = args.find((a, i) => !a.startsWith("--") && i !== agentAt + 1);
  if (!repo || !HOOK_AGENTS.includes(agent)) {
    console.log("Usage: pnpm connect <path-to-repo> [--agent claude-code|codex] [--remove]");
    process.exit(1);
  }
  const remove = args.includes("--remove");
  let root: string;
  try {
    root = validateRepo(resolve(repo));
  } catch (error) {
    console.log(`${(error as Error).message}: ${resolve(repo)}`);
    process.exit(1);
  }
  const file = connect(root, remove, agent);
  if (!remove) {
    const store = new Store();
    store.registerProject(root);
    store.db.close();
  }
  const next =
    agent === "codex"
      ? "Start Quoli with `pnpm dev`, then run `codex` in that repo and approve Quoli's hooks with /hooks.\nCodex runs project hooks only after you trust them."
      : "Start Quoli with `pnpm dev`, then start a new Claude Code session in that repo.";
  console.log(
    remove
      ? `Removed Quoli hooks from ${file}`
      : `Connected. ${agent === "codex" ? "Codex" : "Claude Code"} sessions in ${root} now stream to Quoli.\nHooks: ${file}\n${next}`,
  );
}
