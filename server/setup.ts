import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_NAMES } from "../shared/model.ts";
import {
  installSyncCommand,
  removeSyncCommand,
  syncCommand,
  syncCommandFile,
} from "./background.ts";
import {
  commandFor,
  connect,
  HOOK_AGENTS,
  type HookAgent,
  hook,
  isPluginAgent,
  pluginSource,
  writeHooks,
  writePlugin,
} from "./connect.ts";
import { home, Store } from "./db.ts";

/**
 * `pnpm quoli-setup` installs Quoli once for the user, so every repository is recorded without
 * connecting it: each agent's documented user-level location gets Quoli's hook, plugin or
 * extension.
 *   Claude Code  ~/.claude/settings.json            (code.claude.com/docs/en/hooks)
 *   Codex        $CODEX_HOME/hooks.json, ~/.codex   (learn.chatgpt.com/docs/hooks; trusted once in /hooks)
 *   OpenCode     ~/.config/opencode/plugins/        (opencode.ai/docs/plugins)
 *   Pi           ~/.pi/agent/extensions/            (pi docs/extensions.md; $PI_CODING_AGENT_DIR)
 * The hook script is copied into the Quoli home so it keeps working wherever Quoli was cloned,
 * and it queues events in the home's spool.jsonl while Quoli is not running.
 */

const configHome = () => process.env.XDG_CONFIG_HOME || join(homedir(), ".config");

/** Each agent's user-level folder (present when the agent has been used) and Quoli's file in it. */
export function globalTarget(agent: HookAgent): { dir: string; file: string } {
  switch (agent) {
    case "claude-code": {
      const dir = join(homedir(), ".claude");
      return { dir, file: join(dir, "settings.json") };
    }
    case "codex": {
      const dir = process.env.CODEX_HOME || join(homedir(), ".codex");
      return { dir, file: join(dir, "hooks.json") };
    }
    case "opencode": {
      const dir = join(configHome(), "opencode");
      return { dir, file: join(dir, "plugins", "quoli.js") };
    }
    case "pi": {
      const dir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
      return { dir, file: join(dir, "extensions", "quoli.ts") };
    }
  }
}

export const spoolFile = () => join(home(), "spool.jsonl");
const hookCopy = () => join(home(), "quoli-hook.mjs");

/** Agents whose user-level folder exists on this machine. */
export const detectedAgents = () => HOOK_AGENTS.filter((a) => existsSync(globalTarget(a).dir));

export interface SetupResult {
  agent: HookAgent;
  file: string;
  error?: string;
}

/**
 * Installs (or with `remove`, takes out) Quoli for the given agents. Installing also removes
 * Quoli's per-repository hooks from registered projects for those agents, so no event is recorded
 * twice.
 */
export function setup(agents: HookAgent[], remove = false, roots?: string[]): SetupResult[] {
  if (!remove) {
    mkdirSync(home(), { recursive: true });
    copyFileSync(hook, hookCopy());
    installSyncCommand();
  }
  const results = agents.map((agent): SetupResult => {
    const { file } = globalTarget(agent);
    try {
      if (isPluginAgent(agent)) writePlugin(file, agent, remove, remove ? "" : spoolFile());
      else writeHooks(file, agent, remove, hookCopy());
      return { agent, file };
    } catch (error) {
      return { agent, file, error: (error as Error).message };
    }
  });
  if (remove && !HOOK_AGENTS.some(isSetUp)) removeSyncCommand();
  if (!remove) {
    const done = results.filter((r) => !r.error).map((r) => r.agent);
    for (const root of roots ?? registeredRoots()) {
      for (const agent of done) {
        try {
          connect(root, true, agent);
        } catch {}
      }
    }
  }
  return results;
}

function registeredRoots(): string[] {
  const store = new Store();
  try {
    return store.registeredProjects().map((p) => p.root);
  } finally {
    store.db.close();
  }
}

/** Each agent: found on this machine, set up for every repository, and the file used. */
export const setupStatus = () =>
  HOOK_AGENTS.map((agent) => ({
    agent,
    found: existsSync(globalTarget(agent).dir),
    installed: isSetUp(agent),
    file: globalTarget(agent).file,
  }));

/** Whether Quoli's user-level install is present for an agent. */
export function isSetUp(agent: HookAgent): boolean {
  const { file } = globalTarget(agent);
  try {
    return readFileSync(file, "utf8").includes(
      isPluginAgent(agent)
        ? `quoli-${agent === "pi" ? "pi-extension" : "opencode-plugin"}`
        : "quoli-hook.mjs",
    );
  } catch {
    return false;
  }
}

/**
 * Rewrites the user-level install where it no longer matches this Quoli (another port, or an
 * older hook or plugin after an update). Agents without it are left alone. Returns those updated.
 */
export function refreshSetup(): HookAgent[] {
  const agents = HOOK_AGENTS.filter(isSetUp);
  if (!agents.length) return [];
  let hookStale = true;
  try {
    hookStale = readFileSync(hookCopy(), "utf8") !== readFileSync(hook, "utf8");
  } catch {}
  const stale = agents.filter((agent) => {
    let text = "";
    try {
      text = readFileSync(globalTarget(agent).file, "utf8");
    } catch {}
    return isPluginAgent(agent)
      ? text !== pluginSource(agent, spoolFile())
      : hookStale || !text.includes(JSON.stringify(commandFor(agent, hookCopy())).slice(1, -1));
  });
  if (stale.length) setup(stale, false, []);
  else if (syncCommandStale()) installSyncCommand();
  return stale;
}

/** sync.json points somewhere else, or (from the package) the app copy is another version. */
function syncCommandStale(): boolean {
  try {
    if (readFileSync(syncCommandFile(), "utf8") !== `${JSON.stringify(syncCommand(), null, 2)}\n`)
      return true;
    if (process.env.QUOLI_BUNDLED !== "1") return false;
    const copy = JSON.parse(readFileSync(join(home(), "app", "package.json"), "utf8"));
    return copy.version !== process.env.QUOLI_VERSION;
  } catch {
    return true;
  }
}

/**
 * How to start Quoli: the package (served from the website while the npm account is suspended,
 * see docs/architecture.md) or a clone of the repository.
 */
export const PACKAGE = `npx https://iceq.best/quoli-${process.env.QUOLI_VERSION}.tgz`;
export const START = process.env.QUOLI_BUNDLED === "1" ? PACKAGE : "pnpm dev";
const SETUP = process.env.QUOLI_BUNDLED === "1" ? `${PACKAGE} setup` : "pnpm quoli-setup";

/** `quoli setup [agent…] [--remove]`; returns the exit code. */
export function setupCli(args: string[], hint = true): number {
  const remove = args.includes("--remove");
  const named = args.filter((a) => !a.startsWith("--")) as HookAgent[];
  const unknown = named.filter((a) => !HOOK_AGENTS.includes(a));
  if (unknown.length || args.includes("--help")) {
    console.log(
      `Usage: ${SETUP} [${HOOK_AGENTS.join("|")} ...] [--remove]\nWith no agent named, sets up every agent found on this machine.`,
    );
    return unknown.length ? 1 : 0;
  }
  const agents = named.length ? named : remove ? HOOK_AGENTS : detectedAgents();
  if (!agents.length) {
    console.log("No coding agent found (looked for Claude Code, Codex, OpenCode and Pi).");
    return 1;
  }
  const results = setup(agents, remove);
  for (const r of results) {
    const name = AGENT_NAMES[r.agent];
    console.log(
      r.error
        ? `  ✗ ${name}: ${r.error}`
        : `  ✓ ${name} ${remove ? "removed from" : "→"} ${r.file}`,
    );
  }
  if (!remove && hint) {
    console.log(
      `\nEvery repository you open with these agents is now recorded. Start Quoli with \`${START}\`.`,
    );
    if (results.some((r) => r.agent === "codex" && !r.error)) {
      console.log("Codex: run `codex` once and approve Quoli's hooks with /hooks.");
    }
    console.log("Sessions run while Quoli is closed are kept and appear when it starts.");
  }
  return results.some((r) => r.error) ? 1 : 0;
}

// Run directly (pnpm quoli-setup). The published bundle has its own entry, server/cli.ts.
if (
  process.env.QUOLI_BUNDLED !== "1" &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  process.exit(setupCli(process.argv.slice(2)));
}
