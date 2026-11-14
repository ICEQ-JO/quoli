import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { home } from "./db.ts";

/**
 * Which repositories Quoli records. The agents' hooks are installed once for the whole user, so
 * this is where "only this project" lives: `scope.json` in the Quoli home holds either the only
 * repositories to record, or the ones to leave out. No file means every repository. The hook
 * script reads the same file (see server/hook.mjs) so events from other repositories are never
 * queued, and `recordEvent` checks it again before anything is stored.
 */
export interface Scope {
  /** Record only these repository roots. */
  only?: string[];
  /** Record everything except these roots. Ignored when `only` is set. */
  ignore?: string[];
}

export const scopeFile = () => join(home(), "scope.json");

let cache: { file: string; mtime: number; scope: Scope } | null = null;

export function loadScope(): Scope {
  const file = scopeFile();
  let mtime = -1;
  try {
    mtime = statSync(file).mtimeMs;
  } catch {}
  if (cache && cache.file === file && cache.mtime === mtime) return cache.scope;
  let scope: Scope = {};
  if (mtime >= 0) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      const list = (v: unknown) =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
      scope = { only: list(raw?.only), ignore: list(raw?.ignore) };
    } catch {}
  }
  cache = { file, mtime, scope };
  return scope;
}

export function saveScope(scope: Scope) {
  const clean: Scope = scope.only
    ? { only: unique(scope.only) }
    : scope.ignore?.length
      ? { ignore: unique(scope.ignore) }
      : {};
  cache = null;
  if (!clean.only && !clean.ignore) {
    rmSync(scopeFile(), { force: true });
    return;
  }
  mkdirSync(home(), { recursive: true });
  writeFileSync(scopeFile(), `${JSON.stringify(clean, null, 2)}\n`, { mode: 0o600 });
}

const unique = (roots: string[]) => [...new Set(roots.map((r) => resolve(r)))];

/** `path` is `root` or inside it (worktrees under `.claude/worktrees` count as their project). */
export const inside = (path: string, root: string) =>
  path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

const fold = (p: string) => (process.platform === "linux" ? p : p.toLowerCase());
const real = (p: string) => {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
};
/**
 * `inside`, also when the two are spelled differently: through a symlink (macOS /var is
 * /private/var) or, on Windows and macOS, in another letter case. server/hook.mjs does the same.
 */
const under = (path: string, root: string) =>
  inside(fold(path), fold(root)) || inside(fold(real(path)), fold(real(root)));

/** Whether events from this folder are recorded. */
export function records(path: string, scope = loadScope()): boolean {
  if (scope.only) return scope.only.some((r) => under(path, r));
  return !(scope.ignore ?? []).some((r) => under(path, r));
}

/** Record only `root` (and any roots already chosen the same way). */
export function recordOnly(root: string) {
  const s = loadScope();
  saveScope({ only: [...(s.only ?? []), root] });
}

export function recordEverything() {
  saveScope({});
}

/** Start recording `root` again, in either mode. */
export function startRecording(root: string) {
  const s = loadScope();
  if (s.only) saveScope({ only: [...s.only, root] });
  else saveScope({ ignore: (s.ignore ?? []).filter((r) => !inside(root, r)) });
}

/** Stop recording `root`: drop it from the list, or add it to the ones left out. */
export function stopRecording(root: string) {
  const s = loadScope();
  if (s.only) saveScope({ only: s.only.filter((r) => r !== resolve(root)) });
  else saveScope({ ignore: [...(s.ignore ?? []), root] });
}

/** A short sentence for the CLI. */
export function describeScope(scope = loadScope()): string {
  if (scope.only) {
    return scope.only.length
      ? `Recording only: ${scope.only.join(", ")}`
      : "Recording no projects (add one by running Quoli inside it).";
  }
  return scope.ignore?.length
    ? `Recording every project except: ${scope.ignore.join(", ")}`
    : "Recording every project on this computer.";
}

export const hasScopeFile = () => existsSync(scopeFile());
