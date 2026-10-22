import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { isAbsolute } from "node:path";

export type PathInspection =
  | { kind: "missing" | "symlink" | "unsafe" | "not-regular" }
  | { kind: "regular"; size: number };
export type FileRead =
  | { kind: "ok"; bytes: Buffer; size: number }
  | { kind: "missing" }
  | { kind: "symlink" }
  | { kind: "unsafe" }
  | { kind: "not-regular" }
  | { kind: "racy" }
  | { kind: "oversized"; size: number };

function safeRelative(path: string): boolean {
  const parts = path.split("/");
  return (
    Boolean(path) &&
    !isAbsolute(path) &&
    !path.includes("\0") &&
    parts.length <= 128 &&
    parts.every((part) => part !== "" && part !== "." && part !== "..")
  );
}
function failure(error: unknown): { kind: "missing" | "symlink" | "unsafe" } {
  const code = (error as NodeJS.ErrnoException).code;
  return { kind: code === "ENOENT" ? "missing" : code === "ELOOP" ? "symlink" : "unsafe" };
}
/**
 * Linux directory-descriptor traversal: every child opens through an already
 * held parent, so replacing an ancestor with a symlink cannot redirect a later
 * read. Rechecking absolute path strings alone would have a TOCTOU gap.
 * Other platforms fail closed until an equivalent primitive is supported.
 */
function withLeaf<T>(
  root: string,
  relative: string,
  action: (leaf: string) => T,
): T | { kind: "unsafe" | "missing" | "symlink" } {
  if (process.platform !== "linux" || !isAbsolute(root) || !safeRelative(relative))
    return { kind: "unsafe" };
  const absoluteParts = root.split("/").filter(Boolean);
  if (absoluteParts.length > 128) return { kind: "unsafe" };
  const parts = relative.split("/");
  const descriptors: number[] = [];
  try {
    let parent = openSync("/", constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    descriptors.push(parent);
    for (const part of [...absoluteParts, ...parts.slice(0, -1)]) {
      if (part === "." || part === "..") return { kind: "unsafe" };
      const directory = `/proc/self/fd/${parent}/${part}`;
      if (lstatSync(directory).isSymbolicLink()) return { kind: "symlink" };
      parent = openSync(
        directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      descriptors.push(parent);
    }
    return action(`/proc/self/fd/${parent}/${parts.at(-1)}`);
  } catch (error) {
    return failure(error);
  } finally {
    for (const fd of descriptors.reverse()) closeSync(fd);
  }
}
export function inspectPath(root: string, path: string): PathInspection {
  return withLeaf(root, path, (leaf) => {
    const stat = lstatSync(leaf, { bigint: true });
    if (stat.isSymbolicLink()) return { kind: "symlink" as const };
    if (!stat.isFile()) return { kind: "not-regular" as const };
    if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) return { kind: "unsafe" as const };
    return { kind: "regular" as const, size: Number(stat.size) };
  });
}
export function readRegularFile(root: string, path: string, maxBytes: number): FileRead {
  return withLeaf(root, path, (leaf) => {
    const listed = lstatSync(leaf, { bigint: true });
    if (listed.isSymbolicLink()) return { kind: "symlink" as const };
    if (!listed.isFile()) return { kind: "not-regular" as const };
    if (listed.size > BigInt(maxBytes))
      return { kind: "oversized" as const, size: Number(listed.size) };
    const fd = openSync(leaf, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = fstatSync(fd, { bigint: true });
      if (!opened.isFile()) return { kind: "not-regular" as const };
      if (opened.dev !== listed.dev || opened.ino !== listed.ino) return { kind: "racy" as const };
      if (opened.size > BigInt(maxBytes))
        return { kind: "oversized" as const, size: Number(opened.size) };
      const buffer = Buffer.allocUnsafe(maxBytes + 1);
      let count = 0;
      while (count < buffer.length) {
        const n = readSync(fd, buffer, count, buffer.length - count, count);
        if (!n) break;
        count += n;
      }
      const after = fstatSync(fd, { bigint: true });
      let current: ReturnType<typeof lstatSync>;
      try {
        current = lstatSync(leaf, { bigint: true });
      } catch {
        return { kind: "racy" as const };
      }
      if (
        after.size !== opened.size ||
        after.mtimeNs !== opened.mtimeNs ||
        after.ctimeNs !== opened.ctimeNs ||
        current.dev !== opened.dev ||
        current.ino !== opened.ino
      )
        return { kind: "racy" as const };
      if (count > maxBytes) return { kind: "oversized" as const, size: count };
      return { kind: "ok" as const, bytes: buffer.subarray(0, count), size: Number(opened.size) };
    } finally {
      closeSync(fd);
    }
  });
}
