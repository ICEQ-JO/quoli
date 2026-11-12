import { type Edge, Handle, MarkerType, type Node, type NodeProps, Position } from "@xyflow/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { CodeFile, FileChange } from "../../../../shared/model.ts";
import { nodeA11y, quietNode } from "../../a11y.ts";
import { fileName, plural } from "../../format.ts";
import type { LensContext, Touch } from "../../state.ts";
import { Board } from "../Board.tsx";
import { type Column, changeMap, importGraph } from "./changemap.ts";

const W = 248;
const H = 48;
const GAP = 10;
const COL_GAP = 120;
const SUB_GAP = 14;
/** Rows before a column wraps into another sub-column, from the canvas height (4–12). */
const rowsFor = (height: number) =>
  Math.max(4, Math.min(12, Math.floor((height - 150) / (H + GAP)) || 10));
const CAP = 14;

export type Source = "session" | "uncommitted";

interface Props {
  ctx: LensContext;
  source: Source;
  hops: 1 | 2;
  bar: ReactNode;
}

interface FileData {
  path: string;
  file: CodeFile | null;
  column: Column;
  change: { added: number; removed: number; rewrite?: boolean } | null;
  /** Edited by this session (at any time) / up to the replay cursor. */
  agentEdited: boolean;
  pending: boolean;
  touch: Touch | null;
  selected: boolean;
  related: boolean;
  faded: boolean;
  hasSession: boolean;
}

export function ChangeMapView({ ctx, source, hops, bar }: Props) {
  const { code, session, touched, selection, select } = ctx;
  const graph = useMemo(() => (code ? importGraph(code.files) : null), [code]);
  const byPath = useMemo(() => new Map((code?.files ?? []).map((f) => [f.path, f])), [code]);
  const sessionChanges = useMemo(
    () => new Map((session?.report.changes ?? []).map((c: FileChange) => [c.path, c])),
    [session],
  );
  const sessionEdited = useMemo(
    () =>
      Object.entries(session?.files ?? {})
        .filter(([, t]) => t.edited > 0)
        .map(([p]) => p),
    [session],
  );
  const centre = useMemo(
    () =>
      source === "session"
        ? sessionEdited
        : (code?.files ?? []).filter((f) => f.status !== "clean").map((f) => f.path),
    [source, sessionEdited, code],
  );
  const map = useMemo(
    () => (graph ? changeMap(graph, centre, { hops, cap: CAP }) : null),
    [graph, centre, hops],
  );
  const selectedPath = selection?.kind === "file" ? selection.id : null;
  const body = useRef<HTMLDivElement>(null);
  const [ROWS, setRows] = useState(10);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setRows(rowsFor(e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    if (!map) return { nodes, edges };
    const subs = (n: number) => Math.max(1, Math.ceil(n / ROWS));
    const widthOf = (n: number) => subs(n) * W + (subs(n) - 1) * SUB_GAP;
    const rows = (n: number) => Math.min(n, ROWS);
    const tallest = Math.max(...[...map.columns.values()].map((c) => rows(c.length)), 1);
    const top = -((tallest * (H + GAP)) / 2) - 52;
    // x of each column's left edge: the changed files centred on 0, the rest stacked outwards.
    const left = new Map<Column, number>();
    const size = (c: Column) => widthOf(map.columns.get(c)?.length ?? 0);
    left.set(0, -size(0) / 2);
    let edge = -size(0) / 2;
    for (const c of [-1, -2] as Column[]) {
      if (!map.columns.has(c)) continue;
      edge -= COL_GAP + size(c);
      left.set(c, edge);
    }
    edge = size(0) / 2;
    for (const c of [1, 2] as Column[]) {
      if (!map.columns.has(c)) continue;
      left.set(c, edge + COL_GAP);
      edge += COL_GAP + size(c);
    }
    const linked = new Set<string>();
    if (selectedPath) {
      for (const [a, b] of map.edges) {
        if (a === selectedPath) linked.add(b);
        if (b === selectedPath) linked.add(a);
      }
    }
    let tab = true;
    const cols = [...map.columns.keys()].sort((a, b) => a - b);
    for (const col of cols) {
      const list = map.columns.get(col) ?? [];
      const x = left.get(col) ?? 0;
      const k = subs(list.length);
      const y0 = -((rows(list.length) * (H + GAP) - GAP) / 2);
      // Fill down, then across; on the left the first sub-column sits nearest the centre.
      const at = (i: number) => {
        const j = Math.floor(i / ROWS);
        const sub = col < 0 ? k - 1 - j : j;
        return { x: x + sub * (W + SUB_GAP), y: y0 + (i % ROWS) * (H + GAP) };
      };
      nodes.push({
        id: `head:${col}`,
        type: "head",
        position: { x, y: top },
        data: { text: HEADINGS[col](source), count: list.length + (map.more.get(col) ?? 0) },
        style: { width: widthOf(list.length), height: 40 },
        selectable: false,
        ...quietNode,
      });
      list.forEach((path, i) => {
        const file = byPath.get(path) ?? null;
        const sc = sessionChanges.get(path);
        const agentEdited = sessionEdited.includes(path);
        const change =
          source === "session" && sc
            ? { added: sc.added, removed: sc.removed, rewrite: sc.rewrite }
            : (file?.diff ?? (col === 0 && sc ? { added: sc.added, removed: sc.removed } : null));
        const data: FileData = {
          path,
          file,
          column: col,
          change: col === 0 ? change : null,
          agentEdited,
          pending: agentEdited && !touched.get(path)?.edited,
          touch: touched.get(path) ?? null,
          selected: path === selectedPath,
          related: linked.has(path),
          faded: !!selectedPath && path !== selectedPath && !linked.has(path),
          hasSession: !!session,
        };
        nodes.push({
          id: `file:${path}`,
          type: "mapfile",
          position: at(i),
          data: { ...data },
          style: { width: W, height: H },
          ...nodeA11y(label(data, source), tab),
        });
        tab = false;
      });
      const more = map.more.get(col);
      if (more) {
        nodes.push({
          id: `more:${col}`,
          type: "more",
          position: { x, y: y0 + rows(list.length) * (H + GAP) },
          data: { text: `+${more} more not drawn` },
          style: { width: widthOf(list.length), height: 24 },
          selectable: false,
          ...quietNode,
        });
      }
    }
    const centreSet = new Set(map.columns.get(0) ?? []);
    const colOf = new Map<string, number>();
    for (const [c, list] of map.columns) for (const p of list) colOf.set(p, c);
    for (const [from, to] of map.edges) {
      // Two changed files: a bracket down the left side of the column instead of a loop.
      const inner = centreSet.has(from) && centreSet.has(to);
      // An importer left of the file it imports (it also imports a changed file): run left to right.
      const forward = (colOf.get(from) ?? 0) < (colOf.get(to) ?? 0);
      const hot = !!selectedPath && (from === selectedPath || to === selectedPath);
      const cold = !!selectedPath && !hot;
      edges.push({
        id: `${from}->${to}`,
        source: `file:${from}`,
        target: `file:${to}`,
        ...(inner ? { targetHandle: "left", type: "smoothstep" } : {}),
        ...(forward ? { sourceHandle: "right", targetHandle: "left" } : {}),
        focusable: false,
        zIndex: hot ? 1 : 0,
        style: {
          stroke: hot ? "var(--text)" : "var(--line-strong)",
          strokeWidth: hot ? 1.6 : 1.2,
          opacity: cold ? 0.25 : 1,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: hot ? "var(--text)" : "var(--line-strong)",
        },
      });
    }
    return { nodes, edges };
  }, [map, byPath, sessionChanges, sessionEdited, touched, selectedPath, source, session, ROWS]);

  const centreCount = map?.columns.get(0)?.length ?? 0;
  const empty = !code
    ? "Reading the repository…"
    : source === "session"
      ? session
        ? "This session changed no files. Switch to Uncommitted, or All files to browse the repository."
        : "Pick a session to see what it changed, or switch to Uncommitted."
      : "No uncommitted changes in the working tree.";

  return (
    <div className="code-lens map">
      {bar}
      <div className="map-body" ref={body}>
        <Board
          nodes={centreCount ? nodes : []}
          edges={centreCount ? edges : []}
          nodeTypes={nodeTypes}
          fitKey={`map:${code?.root ?? ""}:${session?.id ?? ""}:${source}:${hops}:${centreCount}:${ROWS}`}
          onNodeClick={(n) =>
            n.type === "mapfile" &&
            select({ kind: "file", id: (n.data as unknown as FileData).path })
          }
          onPaneClick={() => select(null)}
          empty={empty}
          legend={
            <>
              {session && <span className="lg edit">changed by the agent</span>}
              {session && <span className="lg read">read by the agent</span>}
              <span
                className="lg line"
                title="Resolved relative JS/TS imports from the code map; other languages show no lines"
              >
                imports → imported file
              </span>
            </>
          }
        />
      </div>
    </div>
  );
}

const HEADINGS: Record<Column, (s: Source) => string> = {
  [-2]: () => "Imported two steps out",
  [-1]: () => "What it imports",
  0: (s) => (s === "session" ? "Changed by this session" : "Uncommitted changes"),
  1: () => "What imports it",
  2: () => "Importers two steps out",
} as Record<Column, (s: Source) => string>;

function label(d: FileData, source: Source): string {
  const parts = [d.path];
  if (d.column === 0) parts.push(source === "session" ? "changed by this session" : "uncommitted");
  if (d.change) parts.push(`${d.change.added} lines added, ${d.change.removed} removed`);
  if (d.column < 0) parts.push("imported by the changed files");
  if (d.column > 0) parts.push("imports the changed files");
  if (d.touch?.read && !d.touch.edited) parts.push("read by this session");
  return parts.join(", ");
}

function MapFileNode({ data }: NodeProps) {
  const d = data as unknown as FileData;
  const dir = d.path.includes("/") ? d.path.slice(0, d.path.lastIndexOf("/")) : "";
  const isNew = d.file?.status === "untracked" || d.file?.status === "added";
  const cls = [
    "map-file",
    d.column === 0 ? "centre" : "near",
    d.agentEdited && d.column === 0 ? "agent" : "",
    d.pending ? "pending" : "",
    d.touch?.read && !d.touch.edited ? "read" : "",
    d.selected ? "selected" : "",
    d.related ? "related" : "",
    d.faded ? "faded" : "",
  ].join(" ");
  return (
    <div className={cls} title={d.path}>
      <Handle type="target" position={Position.Right} className="h" />
      <Handle type="target" position={Position.Left} id="left" className="h" />
      <div className="mf-top">
        <span className="mf-name">{fileName(d.path)}</span>
        {d.change && (
          <span className="mf-diff">
            {d.change.added > 0 && <span className="add">+{d.change.added}</span>}
            {d.change.removed > 0 && <span className="del">−{d.change.removed}</span>}
          </span>
        )}
      </div>
      <div className="mf-sub">
        <span className="mf-dir">{dir || "repository root"}</span>
        {d.column === 0 && isNew && <span className="mf-tag">new</span>}
        {d.column === 0 && !isNew && d.change?.rewrite && (
          <span className="mf-tag" title="Written in full by the agent; removed lines are unknown">
            rewritten
          </span>
        )}
        {d.column === 0 && d.hasSession && !d.agentEdited && (
          <span className="mf-tag git">not by this session</span>
        )}
        {d.file && !d.file.scanned && d.column === 0 && (
          <span className="mf-tag" title="Contents not read: unknown type or over the scan limit">
            not scanned
          </span>
        )}
        {d.file?.scanned && d.column !== 0 && (
          <span className="mf-lines">{plural(d.file.lines, "line")}</span>
        )}
      </div>
      <Handle type="source" position={Position.Left} className="h" />
      <Handle type="source" position={Position.Right} id="right" className="h" />
    </div>
  );
}

function HeadNode({ data }: NodeProps) {
  const { text, count } = data as { text: string; count: number };
  return (
    <div className="map-head">
      <span>{text}</span>
      <span className="map-count">{count}</span>
    </div>
  );
}

function MoreNode({ data }: NodeProps) {
  return <div className="map-more">{(data as { text: string }).text}</div>;
}

const nodeTypes = { mapfile: MapFileNode, head: HeadNode, more: MoreNode };
