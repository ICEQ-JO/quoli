import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export function connect(repo: string, remove = false) {
  const file = join(resolve(repo), ".claude", "settings.local.json");
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
  const file = connect(repo, remove);
  console.log(
    remove
      ? `Removed Quoli hooks from ${file}`
      : `Connected. Claude Code sessions in ${resolve(repo)} now stream to Quoli.\nHooks: ${file}\nStart Quoli with \`pnpm dev\`, then start a new Claude Code session in that repo.`,
  );
}
