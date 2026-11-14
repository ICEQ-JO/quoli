import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

/**
 * A folder as the operating system spells it: symlinks followed (macOS /var is /private/var) and,
 * on Windows, short names (RUNNER~1) expanded and Git's forward slashes turned back. Unchanged
 * when the folder cannot be read.
 */
export function nativePath(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
}

/** `nativePath` of the nearest folder that exists, for files that were deleted or never written. */
function nativeFile(p: string): string {
  const dir = dirname(p);
  if (dir === p) return p;
  try {
    return realpathSync.native(p);
  } catch {
    return join(nativeFile(dir), basename(p));
  }
}

const inside = (r: string) => r !== "" && !r.startsWith("..") && !isAbsolute(r);

/**
 * A path inside the repository as repo-relative with forward slashes on every system (the form Git
 * and the web app use), or null when it lies outside. Tries the paths as given first, then as the
 * system spells them, since an agent may report the folder through a symlink or a short name.
 */
export function repoRelative(path: string, root: string): string | null {
  if (!isAbsolute(path)) return path.split(sep).join("/");
  let r = relative(root, path);
  if (!inside(r)) r = relative(nativePath(root), nativeFile(path));
  return inside(r) ? r.split(sep).join("/") : null;
}
