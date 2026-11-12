import type { CodeFile } from "../../../../shared/model.ts";
import type { Touch } from "../../state.ts";

/** A folder tile in a scope: a (possibly chain-merged) child directory. */
export interface FolderTile {
  /** Full repo-relative path of the deepest directory in the merged chain. */
  path: string;
  /** Label relative to the scope, e.g. `packages/admin/src`. */
  name: string;
  files: number;
}

export interface Scope {
  folders: FolderTile[];
  files: CodeFile[];
}

export interface Heat {
  edited: number;
  read: number;
}

interface DirNode {
  files: CodeFile[];
  dirs: Map<string, DirNode>;
  total: number;
}

export interface CodeIndex {
  /** Directory path ("" = root) to node. */
  at: (dir: string) => DirNode | null;
}

/** Index files by directory once; every scope query afterwards is cheap. */
export function indexFiles(files: CodeFile[]): CodeIndex {
  const root: DirNode = { files: [], dirs: new Map(), total: 0 };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    node.total++;
    for (const part of parts.slice(0, -1)) {
      let next = node.dirs.get(part);
      if (!next) {
        next = { files: [], dirs: new Map(), total: 0 };
        node.dirs.set(part, next);
      }
      next.total++;
      node = next;
    }
    node.files.push(f);
  }
  const at = (dir: string) => {
    let node: DirNode | undefined = root;
    for (const part of dir ? dir.split("/") : []) node = node?.dirs.get(part);
    return node ?? null;
  };
  return { at };
}

/** Child folders (single-child chains merged) and own files of a directory. */
export function scopeOf(index: CodeIndex, dir: string): Scope {
  const node = index.at(dir);
  if (!node) return { folders: [], files: [] };
  const folders: FolderTile[] = [];
  for (const [name, child] of node.dirs) {
    let label = name;
    let path = dir ? `${dir}/${name}` : name;
    let cur = child;
    while (cur.files.length === 0 && cur.dirs.size === 1) {
      const [[n, only]] = cur.dirs;
      label += `/${n}`;
      path += `/${n}`;
      cur = only;
    }
    folders.push({ path, name: label, files: cur.total });
  }
  folders.sort((a, b) => b.files - a.files || a.name.localeCompare(b.name));
  return { folders, files: [...node.files].sort((a, b) => a.path.localeCompare(b.path)) };
}

/** Directory that contains a file; the scope to open for a file selected elsewhere. */
export function scopeForPath(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Directory path to the number of touched files at or below it (root = ""). */
export function aggregateTouches(touched: Map<string, Touch>): Map<string, Heat> {
  const out = new Map<string, Heat>();
  for (const [path, t] of touched) {
    if (!t.edited && !t.read) continue;
    let dir = scopeForPath(path);
    for (;;) {
      const h = out.get(dir) ?? { edited: 0, read: 0 };
      if (t.edited) h.edited++;
      else h.read++;
      out.set(dir, h);
      if (!dir) break;
      dir = scopeForPath(dir);
    }
  }
  return out;
}

/** Breadcrumb segments for a scope: `a/b` gives a, a/b. */
export function crumbs(scope: string): { name: string; path: string }[] {
  const parts = scope ? scope.split("/") : [];
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join("/") }));
}

/** Heat strength 0..1 for a share of touched files; sqrt keeps small shares visible. */
export function intensity(share: number): number {
  if (share <= 0) return 0;
  return Math.min(1, Math.sqrt(share) * 0.9 + 0.12);
}

/** Grid columns for n tiles: wide enough to read, narrow enough to fit. */
export function tileColumns(n: number): number {
  return Math.max(1, Math.min(n, 4, Math.ceil(Math.sqrt(n))));
}
