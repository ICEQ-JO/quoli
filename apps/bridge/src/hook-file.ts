import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtime } from "@traceframe/storage/runtime";

/**
 * Shared JSON hook-file handling for harnesses that register command hooks in a
 * file (Claude Code settings, Codex hooks.json).
 *
 * The helpers only ever add or remove Quoli's own hook groups. Every other key,
 * hook, matcher and handler in the file is written back unchanged.
 */

export type HookGroup = { matcher?: string; hooks: { type: string; command: string }[] };
export type HookFile = Record<string, unknown>;

const BRIDGE_MARKER = "apps/bridge/src/index.ts";
const PACKAGED_BRIDGE = "runtime/quoli-hook-v1.mjs";

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** True when a hook command belongs to this build's bridge. */
export function ownsBridgeCommand(command: string): boolean {
  return command.includes(BRIDGE_MARKER) || command.includes(PACKAGED_BRIDGE);
}

export function readHookFile(path: string): HookFile {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Hook settings are not an object");
    return parsed as HookFile;
  } catch {
    throw new Error("The existing hook file could not be parsed; nothing was changed.");
  }
}

export function writeHookFile(path: string, settings: HookFile): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  const temporary = `${path}.traceframe.tmp`;
  writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o644 });
  renameSync(temporary, path);
  chmodSync(path, 0o644);
}

function groups(settings: HookFile, event: string): HookGroup[] {
  const hooks = (settings.hooks as Record<string, unknown>) ?? {};
  return Array.isArray(hooks[event]) ? ([...hooks[event]] as HookGroup[]) : [];
}

function isOwned(group: HookGroup, owns: (command: string) => boolean): boolean {
  return group.hooks.some((handler) => owns(handler.command));
}

function setGroups(settings: HookFile, event: string, next: HookGroup[]): void {
  const hooks = { ...((settings.hooks as Record<string, unknown>) ?? {}) };
  if (next.length) hooks[event] = next;
  else delete hooks[event];
  if (Object.keys(hooks).length) settings.hooks = hooks;
  else delete settings.hooks;
}

/** Counts every hook group in the file that Quoli does not own. */
export function countForeignGroups(settings: HookFile, owns = ownsBridgeCommand): number {
  const hooks = (settings.hooks as Record<string, unknown>) ?? {};
  let preserved = 0;
  for (const value of Object.values(hooks)) {
    if (!Array.isArray(value)) continue;
    for (const group of value as HookGroup[]) if (!isOwned(group, owns)) preserved++;
  }
  return preserved;
}

/** Appends one owned group per event, keeping existing groups in place. */
export function addOwnedGroups(
  settings: HookFile,
  events: readonly string[],
  command: string,
  owns = ownsBridgeCommand,
): string[] {
  const added: string[] = [];
  for (const event of events) {
    const kept = groups(settings, event).filter((group) => !isOwned(group, owns));
    kept.push({ hooks: [{ type: "command", command }] });
    setGroups(settings, event, kept);
    added.push(event);
  }
  return added;
}

/** Removes only the groups Quoli owns and reports the events that held one. */
export function removeOwnedGroups(
  settings: HookFile,
  events: readonly string[],
  owns = ownsBridgeCommand,
): string[] {
  const removed: string[] = [];
  for (const event of events) {
    const kept = groups(settings, event).filter((group) => {
      if (!isOwned(group, owns)) return true;
      removed.push(event);
      return false;
    });
    setGroups(settings, event, kept);
  }
  return [...new Set(removed)];
}

/**
 * Reads the registered project id back from an owned hook command. The project
 * id is the argument after the bridge script; an optional harness name follows.
 */
export function ownedProjectId(
  settings: HookFile,
  events: readonly string[],
  owns = ownsBridgeCommand,
): { installed: boolean; projectId: string | null } {
  for (const event of events) {
    for (const group of groups(settings, event)) {
      const handler = group.hooks.find((entry) => owns(entry.command));
      if (handler) {
        const tokens = handler.command.trim().split(/\s+/);
        const script = tokens.findIndex((token) => owns(token));
        return { installed: true, projectId: tokens[script + 1] ?? null };
      }
    }
  }
  return { installed: false, projectId: null };
}

/** True when any hook command in the file points at this release's runtime. */
export function usesRuntime(settings: HookFile, releaseRoot: string): boolean {
  const script = shellQuote(join(releaseRoot, PACKAGED_BRIDGE));
  const hooks = (settings.hooks as Record<string, unknown>) ?? {};
  return Object.values(hooks).some(
    (value) =>
      Array.isArray(value) &&
      (value as HookGroup[]).some((group) =>
        group.hooks?.some(
          (hook) => typeof hook.command === "string" && hook.command.includes(script),
        ),
      ),
  );
}

/** The shell command a harness runs to pass one hook payload to this build. */
export function bridgeCommand(projectId: string, harness?: string): string {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  // The hook runs in the project directory, so every path it needs is absolute.
  const loader = join(repo, "node_modules/tsx/dist/loader.mjs");
  const script = join(repo, BRIDGE_MARKER);
  const config = runtime();
  const packaged = process.env.QUOLI_RUNTIME_ROOT;
  const command = packaged
    ? `${shellQuote(process.execPath)} ${shellQuote(join(packaged, PACKAGED_BRIDGE))}`
    : `${shellQuote(process.execPath)} --import ${shellQuote(loader)} ${shellQuote(script)}`;
  return `TRACEFRAME_DATA_DIR=${shellQuote(config.dataDir)} TRACEFRAME_COLLECTOR_PORT=${shellQuote(String(config.collectorPort))} ${command} ${projectId}${harness ? ` ${harness}` : ""}`;
}
