import { type Edge, Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { useMemo, useState } from "react";
import type { CodeFile } from "../../../shared/model.ts";
import { compact, fileName } from "../format.ts";
import { isSelected, type LensContext, type Touch } from "../state.ts";
import { Board } from "./Board.tsx";

interface Dir {
  path: string;
  name: string;
  files: CodeFile[];
  dirs: Dir[];
  total: number;
}

const FILE_W = 184;
const FILE_H = 30;
const GAP = 8;
const PAD = 12;
const HEAD = 30;
const COLLAPSED_W = 184;
const COLLAPSED_H = 44;
const BIG_REPO = 220;

function tree(files: CodeFile[]): Dir {
  const root: Dir = { path: "", name: "", files: [], dirs: [], total: 0 };
  for (const f of files) {
    let dir = root;
    const parts = f.path.split("/");
    root.total++;
    for (const part of parts.slice(0, -1)) {
      const path = dir.path ? `${dir.path}/${part}` : part;
      let next = dir.dirs.find((d) => d.name === part);
      if (!next) {
        next = { path, name: part, files: [], dirs: [], total: 0 };
        dir.dirs.push(next);
      }
      next.total++;
      dir = next;
    }
    dir.files.push(f);
  }
  // Merge single-child chains like src/app/api into one box.
  const squash = (d: Dir): Dir => {
    d.dirs = d.dirs.map(squash);
    if (d.path && !d.files.length && d.dirs.length === 1) {
      const only = d.dirs[0];
      return { ...only, name: `${d.name}/${only.name}` };
    }
    return d;
  };
  const r = squash(root);
  const sort = (d: Dir) => {
    d.dirs.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    d.files.sort((a, b) => a.path.localeCompare(b.path));
    d.dirs.forEach(sort);
  };
  sort(r);
  return r;
}

interface Laid {
  w: number;
  h: number;
  nodes: Node[];
}

function layout(
  dir: Dir,
  depth: number,
  isOpen: (d: Dir) => boolean,
  touched: Map<string, Touch>,
): Laid {
  const id = `dir:${dir.path}`;
  const hot = [...touched.keys()].some((p) => dir.path === "" || p.startsWith(`${dir.path}/`));
  if (depth > 0 && !isOpen(dir)) {
    return {
      w: COLLAPSED_W,
      h: COLLAPSED_H,
      nodes: [
        {
          id,
          type: "folded",
          position: { x: 0, y: 0 },
          data: { dir, hot },
          style: { width: COLLAPSED_W, height: COLLAPSED_H },
        },
      ],
    };
  }
  const children: Node[] = [];
  const cols = Math.max(
    1,
    Math.min(dir.files.length, Math.ceil(Math.sqrt(dir.files.length / 1.5)), 4),
  );
  dir.files.forEach((f, i) => {
    children.push({
      id: `file:${f.path}`,
      type: "file",
      parentId: id,
      position: {
        x: PAD + (i % cols) * (FILE_W + GAP),
        y: HEAD + Math.floor(i / cols) * (FILE_H + GAP),
      },
      data: { file: f },
      style: { width: FILE_W, height: FILE_H },
    });
  });
  const filesW = dir.files.length ? cols * (FILE_W + GAP) - GAP : 0;
  const filesH = dir.files.length ? Math.ceil(dir.files.length / cols) * (FILE_H + GAP) - GAP : 0;

  // Shelf-pack subdirectories into rows.
  const maxRow = Math.max(filesW, depth === 0 ? 2200 : depth === 1 ? 1300 : 820);
  let x = 0;
  let y = filesH ? filesH + 16 : 0;
  let rowH = 0;
  let width = filesW;
  for (const sub of dir.dirs) {
    const laid = layout(sub, depth + 1, isOpen, touched);
    if (x > 0 && x + laid.w > maxRow) {
      x = 0;
      y += rowH + 14;
      rowH = 0;
    }
    const [top, ...rest] = laid.nodes;
    children.push({ ...top, parentId: id, position: { x: PAD + x, y: HEAD + y } }, ...rest);
    x += laid.w + 14;
    rowH = Math.max(rowH, laid.h);
    width = Math.max(width, x - 14);
  }
  const w = Math.max(width, 160) + PAD * 2;
  const h = HEAD + y + rowH + PAD;
  return {
    w,
    h,
    nodes: [
      {
        id,
        type: "dir",
        position: { x: 0, y: 0 },
        data: { dir, hot, depth },
        style: { width: w, height: h },
      },
      ...children,
    ],
  };
}

export function CodeLens(ctx: LensContext) {
  const { code, touched, selection, select, session } = ctx;
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const root = useMemo(() => (code ? tree(code.files) : null), [code]);
  const big = (code?.files.length ?? 0) > BIG_REPO;

  const { nodes, edges } = useMemo(() => {
    if (!root || !code) return { nodes: [], edges: [] };
    const sessionFiles = new Set(Object.keys(session?.files ?? {}));
    const isOpen = (d: Dir) => {
      if (d.path in toggled) return toggled[d.path];
      if (!big) return true;
      return (
        [...sessionFiles].some((p) => p.startsWith(`${d.path}/`)) ||
        code.files.some((f) => f.status !== "clean" && f.path.startsWith(`${d.path}/`))
      );
    };
    const laid = layout(root, 0, isOpen, touched);
    laid.nodes[0].data = { ...laid.nodes[0].data, label: code.root.split("/").at(-1) };
    const sel = selection?.kind === "file" ? selection.id : null;
    const related = new Set<string>();
    const edges: Edge[] = [];
    if (sel) {
      const file = code.files.find((f) => f.path === sel);
      for (const imp of file?.imports ?? []) {
        related.add(imp);
        edges.push(edge(sel, imp, "out"));
      }
      for (const f of code.files) {
        if (f.imports.includes(sel)) {
          related.add(f.path);
          edges.push(edge(f.path, sel, "in"));
        }
      }
    }
    const dimUntouched = touched.size > 0;
    const fold = (path: string) => setToggled((t) => ({ ...t, [path]: false }));
    const nodes = laid.nodes.map((n) => {
      if (n.type === "dir") return { ...n, data: { ...n.data, fold } };
      if (n.type !== "file") return n;
      const f = (n.data as { file: CodeFile }).file;
      return {
        ...n,
        data: {
          file: f,
          touch: touched.get(f.path) ?? null,
          selected: isSelected(selection, "file", f.path),
          related: related.has(f.path),
          dim: dimUntouched && !touched.has(f.path) && !related.has(f.path) && sel !== f.path,
        },
      };
    });
    return { nodes, edges };
  }, [root, code, toggled, big, touched, selection, session]);

  const focus = useMemo(() => [...touched.keys()].map((p) => `file:${p}`), [touched]);

  return (
    <Board
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitKey={`${code?.root}:${session?.id ?? ""}:${Object.keys(toggled).length}`}
      focus={big && focus.length ? focus : undefined}
      onNodeClick={(n) => {
        if (n.type === "file") select({ kind: "file", id: n.id.slice(5) });
        if (n.type === "folded") {
          const d = (n.data as { dir: Dir }).dir;
          setToggled((t) => ({ ...t, [d.path]: true }));
        }
      }}
      onPaneClick={() => select(null)}
      empty={code ? "No files found in this repository." : "Reading the repository…"}
      legend={
        <>
          <span className="lg edit">edited</span>
          <span className="lg read">read</span>
          <span className="lg git">M · changed in git</span>
          {code?.truncated ? <span>{code.truncated} files not shown</span> : null}
          {big && <span>Folders without activity are folded — click to open</span>}
        </>
      }
    />
  );
}

function edge(from: string, to: string, dir: "in" | "out"): Edge {
  return {
    id: `${from}->${to}`,
    source: `file:${from}`,
    target: `file:${to}`,
    animated: dir === "out",
    style: { stroke: dir === "out" ? "var(--read)" : "var(--muted)", strokeWidth: 1.4 },
  };
}

function FileNode({ data }: NodeProps) {
  const { file, touch, selected, related, dim } = data as {
    file: CodeFile;
    touch: Touch | null;
    selected: boolean;
    related: boolean;
    dim: boolean;
  };
  const cls = [
    "file-node",
    touch?.edited ? "edited" : touch?.read ? "read" : "",
    selected ? "selected" : "",
    related ? "related" : "",
    dim ? "dim" : "",
  ].join(" ");
  return (
    <div className={cls} title={`${file.path} · ${file.lines} lines`}>
      <Handle type="target" position={Position.Left} className="h" />
      <span className="name" title={file.path}>
        {fileName(file.path)}
      </span>
      {touch?.edited ? <span className="badge e">✎{touch.edited}</span> : null}
      {touch?.read ? <span className="badge r">{touch.read}</span> : null}
      {file.status !== "clean" && (
        <span className={`git ${file.status}`}>{file.status[0].toUpperCase()}</span>
      )}
      <Handle type="source" position={Position.Right} className="h" />
    </div>
  );
}

function DirNode({ data }: NodeProps) {
  const { dir, hot, label, depth, fold } = data as {
    dir: Dir;
    hot: boolean;
    label?: string;
    depth: number;
    fold: (path: string) => void;
  };
  return (
    <div className={`dir-node ${hot ? "hot" : ""} ${depth === 0 ? "root" : ""}`}>
      <div className="dir-head">
        <span className="dir-name" title={dir.path || label || dir.name}>
          {label ?? dir.name}
        </span>
        <span className="dir-count">{compact(dir.total)} files</span>
        {depth > 0 && (
          <button
            type="button"
            className="fold"
            title="Fold folder"
            onClick={(e) => {
              e.stopPropagation();
              fold(dir.path);
            }}
          >
            −
          </button>
        )}
      </div>
    </div>
  );
}

function FoldedNode({ data }: NodeProps) {
  const { dir, hot } = data as { dir: Dir; hot: boolean };
  return (
    <div className={`folded-node ${hot ? "hot" : ""}`} title="Click to open">
      <span className="dir-name" title={dir.path || dir.name}>
        {dir.name}/
      </span>
      <span className="dir-count">{compact(dir.total)} files</span>
    </div>
  );
}

const nodeTypes = { file: FileNode, dir: DirNode, folded: FoldedNode };
