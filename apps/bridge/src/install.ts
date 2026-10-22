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
const PACKAGED_BRIDGE = "runtime/quoli-hook-v1.mjs";
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

function ownsCommand(command: string): boolean {
  return command.includes(BRIDGE_MARKER) || command.includes(PACKAGED_BRIDGE);
}

/** Detect this packaged runtime's generated hooks before removing its files. */
export function usesPackagedRuntime(root: string, releaseRoot: string): boolean {
  const hooks = readSettings(root).hooks as Record<string, unknown> | undefined;
  const script = shellQuote(join(releaseRoot, PACKAGED_BRIDGE));
  return Object.values(hooks ?? {}).some(
    (groups) =>
      Array.isArray(groups) &&
      groups.some(
        (group: HookGroup) =>
          Array.isArray(group.hooks) &&
          group.hooks.some(
            (hook) => typeof hook.command === "string" && hook.command.includes(script),
          ),
      ),
  );
}

type Settings = Record<string, unknown>;

function bridgeCommand(projectId: string): string {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  // The hook runs in the project directory, so every path it needs is absolute.
  const loader = join(repo, "node_modules/tsx/dist/loader.mjs");
  const script = join(repo, BRIDGE_MARKER);
  const config = runtime();
  const packaged = process.env.QUOLI_RUNTIME_ROOT;
  const command = packaged
    ? `${shellQuote(process.execPath)} ${shellQuote(join(packaged, PACKAGED_BRIDGE))}`
    : `${shellQuote(process.execPath)} --import ${shellQuote(loader)} ${shellQuote(script)}`;
  return `TRACEFRAME_DATA_DIR=${shellQuote(config.dataDir)} TRACEFRAME_COLLECTOR_PORT=${shellQuote(String(config.collectorPort))} ${command} ${projectId}`;
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
  return group.hooks.some((handler) => ownsCommand(handler.command));
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
      const handler = group.hooks?.find((entry) => ownsCommand(entry.command));
      if (handler) {
        const id = handler.command.trim().split(/\s+/).at(-1) ?? "";
        return { installed: true, projectId: id };
      }
    }
  }
  return { installed: false, projectId: null };
}
