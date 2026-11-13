import type { CodeGraph, CodeSymbol, SymbolKind } from "../../../../shared/model.ts";

export interface TreeNode {
  key: string;
  kind: "package" | "folder" | "file";
  /** Shown name; a folder that only holds one folder is merged into it (`src/components`). */
  name: string;
  path: string;
  children: TreeNode[];
  files: number;
}

export interface TreeRow {
  key: string;
  kind: "package" | "folder" | "file" | "symbol";
  depth: number;
  label: string;
  path: string;
  /** Symbol id for symbol rows. */
  id?: string;
  symbolKind?: SymbolKind;
  /** null for rows with nothing below them. */
  open: boolean | null;
  count: number;
}

interface Raw {
  name: string;
  path: string;
  dirs: Map<string, Raw>;
  files: string[];
}

/** Packages → folders → files, merging chains of single folders. Packages come from the stack. */
export function buildTree(graph: CodeGraph): TreeNode {
  const root: Raw = { name: "", path: "", dirs: new Map(), files: [] };
  for (const f of graph.files) {
    let at = root;
    const parts = f.path.split("/");
    for (const part of parts.slice(0, -1)) {
      const path = at.path ? `${at.path}/${part}` : part;
      let next = at.dirs.get(part);
      if (!next) {
        next = { name: part, path, dirs: new Map(), files: [] };
        at.dirs.set(part, next);
      }
      at = next;
    }
    at.files.push(f.path);
  }
  const packages = new Map(graph.stack.packages.filter((p) => p.path).map((p) => [p.path, p.name]));
  const convert = (raw: Raw): TreeNode => {
    let node = raw;
    let name = raw.name;
    while (node.dirs.size === 1 && node.files.length === 0 && node.path !== "") {
      const only = [...node.dirs.values()][0];
      if (packages.has(only.path)) break;
      name = `${name}/${only.name}`;
      node = only;
    }
    const children = [
      ...[...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name)).map(convert),
      ...[...node.files].sort().map(
        (p): TreeNode => ({
          key: `f:${p}`,
          kind: "file",
          name: p.slice(p.lastIndexOf("/") + 1),
          path: p,
          children: [],
          files: 1,
        }),
      ),
    ];
    const pkg = packages.get(raw.path) ?? packages.get(node.path);
    return {
      key: `d:${node.path}`,
      kind: pkg ? "package" : "folder",
      name: pkg && node === raw ? pkg : name,
      path: node.path,
      children,
      files: children.reduce((n, c) => n + c.files, 0),
    };
  };
  const top = convert(root);
  top.name = "";
  return top;
}

/** Keys of the folders that lead to a file, so a selection can be revealed. */
export function pathKeys(root: TreeNode, file: string): string[] {
  const keys: string[] = [];
  let at = root;
  for (;;) {
    const next = at.children.find(
      (c) => c.kind !== "file" && (file === c.path || file.startsWith(`${c.path}/`)),
    );
    if (!next) break;
    keys.push(next.key);
    at = next;
  }
  keys.push(`f:${file}`);
  return keys;
}

export interface FlattenOptions {
  expanded: Set<string>;
  byFile: Map<string, CodeSymbol[]>;
  /** Lower-case filter text; matches paths and qualified symbol names. */
  filter?: string;
  /** Only these files (the session's), with their folders. */
  only?: Set<string> | null;
}

/** Visible rows in order. A filter opens everything that matches. */
export function flatten(root: TreeNode, o: FlattenOptions): TreeRow[] {
  const q = o.filter?.trim().toLowerCase() ?? "";
  const rows: TreeRow[] = [];
  const symbolsOf = (file: string) => (o.byFile.get(file) ?? []).filter((s) => s.kind !== "module");
  const fileMatches = (path: string) =>
    !q ||
    path.toLowerCase().includes(q) ||
    symbolsOf(path).some((s) => s.qualifiedName.toLowerCase().includes(q));
  const keep = (n: TreeNode): boolean => {
    if (n.kind === "file") return (!o.only || o.only.has(n.path)) && fileMatches(n.path);
    return n.children.some(keep);
  };
  const visit = (n: TreeNode, depth: number) => {
    if (!keep(n)) return;
    if (n.kind === "file") {
      const all = symbolsOf(n.path);
      const symbols =
        q && !n.path.toLowerCase().includes(q)
          ? all.filter((s) => s.qualifiedName.toLowerCase().includes(q))
          : all;
      const open = symbols.length ? (q ? true : o.expanded.has(n.key)) : null;
      rows.push({
        key: n.key,
        kind: "file",
        depth,
        label: n.name,
        path: n.path,
        open,
        count: all.length,
      });
      if (open)
        for (const s of symbols) {
          rows.push({
            key: `s:${s.id}`,
            kind: "symbol",
            depth: depth + 1 + (q ? 0 : s.qualifiedName.split(".").length - 1),
            label: q ? s.qualifiedName : s.name,
            path: s.file,
            id: s.id,
            symbolKind: s.kind,
            open: null,
            count: 0,
          });
        }
      return;
    }
    const open = q ? true : o.expanded.has(n.key);
    rows.push({
      key: n.key,
      kind: n.kind,
      depth,
      label: n.name,
      path: n.path,
      open,
      count: n.files,
    });
    if (open) for (const c of n.children) visit(c, depth + 1);
  };
  for (const c of root.children) visit(c, 0);
  return rows;
}
