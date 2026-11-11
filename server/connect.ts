import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./db.ts";
import { git } from "./ingest.ts";

/**
 * `pnpm connect <repo>` adds Quoli's hook to <repo>/.claude/settings.local.json
 * (machine-local, not committed). `--remove` takes it out again. Other hooks are kept.
 */
const EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "SessionEnd",
];
const hook = join(dirname(fileURLToPath(import.meta.url)), "hook.mjs");
const command = `"${process.execPath}" "${hook}" ${Number(process.env.QUOLI_PORT ?? 4400)}`;
const isOurs = (group: { hooks?: { command?: string }[] }) =>
  group.hooks?.some((h) => h.command?.includes("server/hook.mjs")) ?? false;

const settingsFile = (repo: string) => join(resolve(repo), ".claude", "settings.local.json");

/** True when Quoli's hook is present in <root>/.claude/settings.local.json. */
export function hooksInstalled(root: string): boolean {
  try {
    const settings = JSON.parse(readFileSync(settingsFile(root), "utf8"));
    return Object.values<unknown>(settings?.hooks ?? {}).some(
      (groups) => Array.isArray(groups) && groups.some(isOurs),
    );
  } catch {
    return false;
  }
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

export function connect(repo: string, remove = false) {
  const file = settingsFile(repo);
  if (remove && !existsSync(file)) return file;
  const settings = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const hooks: Record<string, { hooks?: { command?: string }[] }[]> = settings.hooks ?? {};
  for (const event of EVENTS) {
    const kept = (hooks[event] ?? []).filter((g) => !isOurs(g));
    hooks[event] = remove ? kept : [...kept, { hooks: [{ type: "command", command } as never] }];
    if (!hooks[event].length) delete hooks[event];
  }
  settings.hooks = hooks;
  if (!Object.keys(hooks).length) delete settings.hooks;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  return file;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const repo = args.find((a) => !a.startsWith("--"));
  if (!repo) {
    console.log("Usage: pnpm connect <path-to-repo> [--remove]");
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
  const file = connect(root, remove);
  if (!remove) {
    const store = new Store();
    store.registerProject(root);
    store.db.close();
  }
  console.log(
    remove
      ? `Removed Quoli hooks from ${file}`
      : `Connected. Claude Code sessions in ${resolve(repo)} now stream to Quoli.\nHooks: ${file}\nStart Quoli with \`pnpm dev\`, then start a new Claude Code session in that repo.`,
  );
}
