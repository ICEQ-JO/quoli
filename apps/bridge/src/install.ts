import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtime } from "@traceframe/storage/runtime";

/**
 * Reversible hook installation.
 *
 * The installer only ever adds or removes Traceframe's own hook entries. Every
 * other setting, hook, telemetry destination and status line in the file is
 * preserved, and the exact diff is reported.
 */

export const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SessionEnd",
] as const;

const BRIDGE_MARKER = "apps/bridge/src/index.ts";

type Settings = Record<string, unknown>;

function bridgeCommand(projectId: string): string {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  // The hook runs in the project directory, so every path it needs is absolute.
  const loader = join(repo, "node_modules/tsx/dist/loader.mjs");
  const script = join(repo, BRIDGE_MARKER);
  const config = runtime();
  return `TRACEFRAME_DATA_DIR="${config.dataDir}" TRACEFRAME_COLLECTOR_PORT="${config.collectorPort}" node --import "${loader}" "${script}" ${projectId}`;
}

function settingsPath(root: string): string {
  return join(root, ".claude", "settings.json");
}

function readSettings(root: string): Settings {
  const path = settingsPath(root);
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Settings are not an object");
    return parsed as Settings;
  } catch {
    throw new Error("The existing settings file could not be parsed; nothing was changed.");
  }
}

function writeSettings(root: string, settings: Settings): void {
  const path = settingsPath(root);
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  const temporary = `${path}.traceframe.tmp`;
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o644 });
  renameSync(temporary, path);
  chmodSync(path, 0o644);
}

type HookGroup = { matcher?: string; hooks: { type: string; command: string }[] };

function isBridgeGroup(group: HookGroup): boolean {
  return group.hooks.some((handler) => handler.command.includes(BRIDGE_MARKER));
}

/** Counts every hook group in the file that Traceframe does not own. */
function countPreserved(settings: Settings): number {
  const hooks = (settings.hooks as Record<string, unknown>) ?? {};
  let preserved = 0;
  for (const value of Object.values(hooks)) {
    if (!Array.isArray(value)) continue;
    for (const group of value as HookGroup[]) {
      if (!isBridgeGroup(group)) preserved++;
    }
  }
  return preserved;
}

export type InstallResult = {
  path: string;
  added: string[];
  preservedGroups: number;
};

/** Adds the Traceframe hook entries, preserving everything already configured. */
export function installHooks(root: string, projectId: string): InstallResult {
  const settings = readSettings(root);
  const hooks = { ...((settings.hooks as Record<string, unknown>) ?? {}) };
  const command = bridgeCommand(projectId);
  const added: string[] = [];
  for (const event of HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? ([...hooks[event]] as HookGroup[]) : [];
    const kept = groups.filter((group) => !isBridgeGroup(group));
    kept.push({ hooks: [{ type: "command", command }] });
    hooks[event] = kept;
    added.push(event);
  }
  settings.hooks = hooks;
  writeSettings(root, settings);
  return { path: settingsPath(root), added, preservedGroups: countPreserved(settings) };
}

/** Removes only the Traceframe hook entries. */
export function uninstallHooks(root: string): { removed: string[]; preservedGroups: number } {
  const settings = readSettings(root);
  const hooks = { ...((settings.hooks as Record<string, unknown>) ?? {}) };
  const removed: string[] = [];
  for (const event of HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? ([...hooks[event]] as HookGroup[]) : [];
    const kept = groups.filter((group) => {
      if (isBridgeGroup(group)) {
        removed.push(event);
        return false;
      }
      return true;
    });
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }
  if (Object.keys(hooks).length) settings.hooks = hooks;
  else delete settings.hooks;
  writeSettings(root, settings);
  return { removed: [...new Set(removed)], preservedGroups: countPreserved(settings) };
}

/** Reports whether the Traceframe hooks are installed for a project. */
export function hookStatus(root: string): { installed: boolean; projectId: string | null } {
  const settings = readSettings(root);
  const hooks = (settings.hooks as Record<string, unknown>) ?? {};
  for (const event of HOOK_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? (hooks[event] as HookGroup[]) : [];
    for (const group of groups) {
      const handler = group.hooks?.find((entry) => entry.command.includes(BRIDGE_MARKER));
      if (handler) {
        const id = handler.command.trim().split(/\s+/).at(-1) ?? "";
        return { installed: true, projectId: id };
      }
    }
  }
  return { installed: false, projectId: null };
}
