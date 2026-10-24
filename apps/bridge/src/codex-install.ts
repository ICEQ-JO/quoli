import { join } from "node:path";
import {
  addOwnedGroups,
  bridgeCommand,
  countForeignGroups,
  type HookFile,
  ownedProjectId,
  readHookFile,
  removeOwnedGroups,
  writeHookFile,
} from "./hook-file";

/**
 * Reversible Codex hook installation.
 *
 * Codex discovers `hooks.json` next to a config layer (`.codex/hooks.json` in a
 * repository, `~/.codex/hooks.json` for the user). Quoli writes only the
 * project file and only its own groups; Codex still requires the user to review
 * and trust them with `/hooks` before they run.
 */

/** The events Quoli collects. Codex exposes more; the rest are not recorded. */
export const CODEX_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "SubagentStart",
  "SubagentStop",
  "SessionEnd",
] as const;

export const codexHooksPath = (root: string): string => join(root, ".codex", "hooks.json");

const readSettings = (root: string): HookFile => readHookFile(codexHooksPath(root));

export function installCodexHooks(
  root: string,
  projectId: string,
): { path: string; added: string[]; preservedGroups: number } {
  const settings = readSettings(root);
  const added = addOwnedGroups(settings, CODEX_HOOK_EVENTS, bridgeCommand(projectId, "codex"));
  writeHookFile(codexHooksPath(root), settings);
  return { path: codexHooksPath(root), added, preservedGroups: countForeignGroups(settings) };
}

export function uninstallCodexHooks(root: string): {
  removed: string[];
  preservedGroups: number;
} {
  const settings = readSettings(root);
  const removed = removeOwnedGroups(settings, CODEX_HOOK_EVENTS);
  writeHookFile(codexHooksPath(root), settings);
  return { removed, preservedGroups: countForeignGroups(settings) };
}

export function codexHookStatus(root: string): {
  installed: boolean;
  projectId: string | null;
} {
  return ownedProjectId(readSettings(root), CODEX_HOOK_EVENTS);
}
