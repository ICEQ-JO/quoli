import { join } from "node:path";
import {
  addOwnedGroups,
  bridgeCommand,
  countForeignGroups,
  type HookFile,
  ownedProjectId,
  readHookFile,
  removeOwnedGroups,
  usesRuntime,
  writeHookFile,
} from "./hook-file";
import { openCodeUsesRuntime } from "./opencode-install";

/**
 * Reversible Claude Code hook installation.
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

function settingsPath(root: string): string {
  return join(root, ".claude", "settings.json");
}

const readSettings = (root: string): HookFile => readHookFile(settingsPath(root));

/** Detect this packaged runtime's generated hooks before removing its files. */
export function usesPackagedRuntime(root: string, releaseRoot: string): boolean {
  if (openCodeUsesRuntime(root, releaseRoot)) return true;
  return usesRuntime(readSettings(root), releaseRoot);
}

export type InstallResult = {
  path: string;
  added: string[];
  preservedGroups: number;
};

/** Adds the Traceframe hook entries, preserving everything already configured. */
export function installHooks(root: string, projectId: string): InstallResult {
  const settings = readSettings(root);
  const added = addOwnedGroups(settings, HOOK_EVENTS, bridgeCommand(projectId));
  writeHookFile(settingsPath(root), settings);
  return {
    path: settingsPath(root),
    added,
    preservedGroups: countForeignGroups(settings),
  };
}

/** Removes only the Traceframe hook entries. */
export function uninstallHooks(root: string): { removed: string[]; preservedGroups: number } {
  const settings = readSettings(root);
  const removed = removeOwnedGroups(settings, HOOK_EVENTS);
  writeHookFile(settingsPath(root), settings);
  return { removed, preservedGroups: countForeignGroups(settings) };
}

/** Reports whether the Traceframe hooks are installed for a project. */
export function hookStatus(root: string): { installed: boolean; projectId: string | null } {
  return ownedProjectId(readSettings(root), HOOK_EVENTS);
}
