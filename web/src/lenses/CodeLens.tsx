import { type Edge, Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import type { CodeFile } from "../../../shared/model.ts";
import { fileLabel, folderLabel, nodeA11y, quietNode } from "../a11y.ts";
import { compact, fileName, plural } from "../format.ts";
import { isSelected, type LensContext, type Touch } from "../state.ts";
import { Board } from "./Board.tsx";
import "./code/code.css";
import {
  aggregateTouches,
  crumbs,
  type FolderTile,
  indexFiles,
  intensity,
  scopeForPath,
  scopeOf,
  tileColumns,
} from "./code/scope.ts";

const TILE_W = 236;
const TILE_H = 96;
const FILE_W = 184;
const FILE_H = 30;
const GAP = 14;
const FILE_GAP = 8;
const TOP = 52;
const MAX_CHIPS = 400;

export function CodeLens(ctx: LensContext) {
  const { code, touched, selection, select, session } = ctx;
  const [scopeState, setScopeState] = useState<{ root: string; path: string }>({
    root: "",
    path: "",
  });
  const [showAllPick, setShowAllPick] = useState<boolean | null>(null);
  const root = code?.root ?? "";
  const picked = scopeState.root === root ? scopeState.path : "";
  const setScope = (path: string) => setScopeState({ root, path });

  const index = useMemo(() => (code ? indexFiles(code.files) : null), [code]);
  const heat = useMemo(() => aggregateTouches(touched), [touched]);

  // Directories that contain anything the session touched at any time (stable while scrubbing).
  const sessionDirs = useMemo(() => {
    const dirs = new Set<string>();
    for (const p of Object.keys(session?.files ?? {})) {
      for (let d = scopeForPath(p); ; d = scopeForPath(d)) {
        dirs.add(d);
        if (!d) break;
      }
    }
    return dirs;
  }, [session]);
  const sessionHasTouches = sessionDirs.size > 0;
  const showAll = showAllPick ?? !sessionHasTouches;
  const selectedPath = selection?.kind === "file" ? selection.id : null;

  // A level that holds a single visible folder and no visible files is skipped: show the next one.
  const scope = useMemo(() => {
    if (!index) return picked;
    let dir = picked;
    for (let i = 0; i < 32; i++) {
      const sc = scopeOf(index, dir);
      const folders = sc.folders.filter((f) => showAll || sessionDirs.has(f.path));
      const hasFiles = sc.files.some(
        (f) => showAll || session?.files[f.path] || f.path === selectedPath,
      );
      if (folders.length !== 1 || hasFiles) break;
      dir = folders[0].path;
    }
    return dir;
  }, [index, picked, showAll, sessionDirs, session, selectedPath]);

  // A file selected elsewhere (Summary, inspector) opens the scope that contains it.
  const selectedFile = selection?.kind === "file" ? selection.id : null;
  useEffect(() => {
    if (selectedFile) setScopeState({ root, path: scopeForPath(selectedFile) });
  }, [selectedFile, root]);

  const { nodes, edges, hidden, capped } = useMemo(() => {
    const none = { nodes: [] as Node[], edges: [] as Edge[], hidden: 0, capped: 0 };
    if (!code || !index) return none;
    const sc = scopeOf(index, scope);
    const keepDir = (p: string) => showAll || sessionDirs.has(p);
    const folders = sc.folders.filter((f) => keepDir(f.path));
    const ordered = [...folders].sort((a, b) => {
      const ha = heat.get(a.path);
      const hb = heat.get(b.path);
      const wa = (ha?.edited ?? 0) * 1000 + (ha?.read ?? 0);
      const wb = (hb?.edited ?? 0) * 1000 + (hb?.read ?? 0);
      return wb - wa || b.files - a.files || a.name.localeCompare(b.name);
    });
    const inSession = (f: CodeFile) => !!session?.files[f.path];
    const files = sc.files.filter(
      (f) => showAll || inSession(f) || touched.has(f.path) || f.path === selectedFile,
    );
    const hiddenCount = sc.folders.length - folders.length + (sc.files.length - files.length);

    const out: Node[] = [];
    let stopTaken = false;
    const tabStop = () => {
      const free = !stopTaken;
      stopTaken = true;
      return free;
    };
    const cols = tileColumns(ordered.length);
    ordered.forEach((f, i) => {
      out.push({
        id: `dir:${f.path}`,
        type: "tile",
        position: {
          x: (i % cols) * (TILE_W + GAP),
          y: TOP + Math.floor(i / cols) * (TILE_H + GAP),
        },
        data: { folder: f, heat: heat.get(f.path) ?? null },
        style: { width: TILE_W, height: TILE_H },
        ...nodeA11y(
          folderLabel(f.path, f.files, heat.get(f.path)?.edited ?? 0, heat.get(f.path)?.read ?? 0),
          tabStop(),
        ),
      });
    });
    const tilesW = ordered.length ? Math.min(cols, ordered.length) * (TILE_W + GAP) - GAP : 0;
    const tilesH = ordered.length ? Math.ceil(ordered.length / cols) * (TILE_H + GAP) - GAP : 0;

    // Touched files first so the cap never hides activity.
    const chips = [...files].sort(
      (a, b) =>
        Number(touched.has(b.path) || b.path === selectedFile) -
          Number(touched.has(a.path) || a.path === selectedFile) || a.path.localeCompare(b.path),
    );
    const shown = chips.slice(0, MAX_CHIPS);
    const fileCols = Math.max(
      1,
      Math.min(
        6,
        Math.floor((Math.max(tilesW, 3 * (FILE_W + FILE_GAP)) + FILE_GAP) / (FILE_W + FILE_GAP)),
      ),
    );
    let y = TOP + (tilesH ? tilesH + 36 : 0);
    if (shown.length) {
      out.push({
        id: "label:files",
        type: "label",
        position: { x: 0, y: y - 24 },
        data: { text: `files in this folder · ${compact(files.length)}` },
        style: { width: 360, height: 18 },
        selectable: false,
        ...quietNode,
      });
      shown
        .sort((a, b) => a.path.localeCompare(b.path))
        .forEach((f, i) => {
          out.push({
            id: `file:${f.path}`,
            type: "file",
            position: {
              x: (i % fileCols) * (FILE_W + FILE_GAP),
              y: y + Math.floor(i / fileCols) * (FILE_H + FILE_GAP),
            },
            data: {
              file: f,
              touch: touched.get(f.path) ?? null,
              selected: isSelected(selection, "file", f.path),
              related: false,
              dim: false,
            },
            style: { width: FILE_W, height: FILE_H },
            ...nodeA11y(
              fileLabel(
                f.path,
                touched.get(f.path)?.edited ?? 0,
                touched.get(f.path)?.read ?? 0,
                f.status,
              ),
              tabStop(),
            ),
          });
        });
      y += Math.ceil(shown.length / fileCols) * (FILE_H + FILE_GAP);
    }

    const edges: Edge[] = [];
    if (selectedFile) {
      const present = new Set(shown.map((f) => f.path));
      const link = (from: string, to: string, kind: "in" | "out") => {
        if (present.has(from) && present.has(to)) edges.push(edge(from, to, kind));
      };
      const rel = new Set<string>();
      const self = code.files.find((f) => f.path === selectedFile);
      for (const imp of self?.imports ?? []) {
        rel.add(imp);
        link(selectedFile, imp, "out");
      }
      for (const f of code.files) {
        if (f.imports.includes(selectedFile)) {
          rel.add(f.path);
          link(f.path, selectedFile, "in");
        }
      }
      for (const n of out) {
        if (n.type !== "file") continue;
        const d = n.data as { file: CodeFile; related: boolean };
        d.related = rel.has(d.file.path);
      }
    }
    return { nodes: out, edges, hidden: hiddenCount, capped: chips.length - shown.length };
  }, [code, index, scope, showAll, sessionDirs, heat, touched, selection, selectedFile, session]);

  const onNodeClick = (n: Node) => {
    if (n.type === "file") select({ kind: "file", id: n.id.slice(5) });
    if (n.type === "tile") setScope((n.data as { folder: FolderTile }).folder.path);
  };

  const trail = crumbs(scope);
  const repoName = root.split("/").filter(Boolean).at(-1) ?? "repo";

  return (
    <div className="code-lens">
      <div className="code-bar">
        <nav className="crumbs" aria-label="Folder path">
          <button
            type="button"
            className={scope === "" ? "here" : ""}
            title={root}
            onClick={() => setScope("")}
          >
            {repoName}
          </button>
          {trail.map((c, i) => (
            <span key={c.path} style={{ display: "contents" }}>
              <span className="sep">/</span>
              <button
                type="button"
                className={i === trail.length - 1 ? "here" : ""}
                title={c.path}
                onClick={() => setScope(c.path)}
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>
        {sessionHasTouches && (
          <button
            type="button"
            className={`code-toggle ${showAll ? "on" : ""}`}
            aria-pressed={showAll}
            onClick={() => setShowAllPick(!showAll)}
          >
            <span className="box" />
            Show all folders
          </button>
        )}
      </div>
      <Board
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitKey={`${root}:${session?.id ?? ""}:${scope}:${showAll}`}
        onNodeClick={onNodeClick}
        onPaneClick={() => select(null)}
        empty={
          code
            ? hidden
              ? "Nothing here was touched by this session. Turn on “Show all folders”."
              : "No files found in this folder."
            : "Reading the repository…"
        }
        legend={
          <>
            <span className="lg edit">edited</span>
            <span className="lg read">read</span>
            <span className="lg git">M · changed in git</span>
            {code && (
              <span>
                {compact(code.files.length)} {code.files.length === 1 ? "file" : "files"}
              </span>
            )}
            {hidden > 0 && !showAll && <span>{hidden} untouched hidden</span>}
            {capped > 0 && <span>{capped} more files not drawn</span>}
            {code?.truncated ? (
              <span>
                {compact(code.truncated)} {code.truncated === 1 ? "file" : "files"} beyond the
                listing cap
              </span>
            ) : null}
          </>
        }
      />
    </div>
  );
}

function edge(from: string, to: string, dir: "in" | "out"): Edge {
  return {
    id: `${from}->${to}`,
    source: `file:${from}`,
    target: `file:${to}`,
    focusable: false,
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
    <div
      className={cls}
      title={file.scanned ? `${file.path} · ${plural(file.lines, "line")}` : file.path}
    >
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

function TileNode({ data }: NodeProps) {
  const { folder, heat } = data as {
    folder: FolderTile;
    heat: { edited: number; read: number } | null;
  };
  const e = heat?.edited ?? 0;
  const r = heat?.read ?? 0;
  const eShare = e / folder.files;
  const rShare = r / folder.files;
  const cls = ["tile-node", e ? "edited" : "", r ? "read" : "", e || r ? "" : "quiet"].join(" ");
  const style = {
    "--heat-e": intensity(eShare),
    "--heat-r": intensity(rShare),
  } as React.CSSProperties;
  return (
    <div
      className={cls}
      style={style}
      title={`${folder.path}/ · ${plural(folder.files, "file")} · ${e} edited · ${r} read`}
    >
      <Handle type="target" position={Position.Left} className="h" />
      <span className="tile-name">{folder.name}/</span>
      <span className="tile-meta">
        {e > 0 && <span className="e">✎ {e} edited</span>}
        {r > 0 && <span className="r">{r} read</span>}
        {!e && !r && <span>untouched</span>}
        <span className="n">
          {compact(folder.files)} {folder.files === 1 ? "file" : "files"}
        </span>
      </span>
      <span className="tile-bar" aria-hidden="true">
        <i style={{ width: `${Math.max(e ? 2 : 0, eShare * 100)}%` }} />
        <i style={{ width: `${Math.max(r ? 2 : 0, rShare * 100)}%` }} />
      </span>
    </div>
  );
}

function LabelNode({ data }: NodeProps) {
  return <div className="label-node">{(data as { text: string }).text}</div>;
}

const nodeTypes = { file: FileNode, tile: TileNode, label: LabelNode };
