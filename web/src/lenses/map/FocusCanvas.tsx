import { type Edge, Handle, MarkerType, type Node, type NodeProps, Position } from "@xyflow/react";
import { useMemo } from "react";
import { nodeA11y, quietNode } from "../../a11y.ts";
import { Board } from "../Board.tsx";
import { type Focus, type GraphIndex, layoutColumns, NODE_H, NODE_W, nodeOf } from "./graph.ts";
import { type IconKind, KindIcon } from "./KindIcon.tsx";

export interface NodeFlags {
  edited: boolean;
  read: boolean;
  isNew: boolean;
}

interface CardData extends Record<string, unknown> {
  icon: IconKind;
  title: string;
  method: string | null;
  sub: string;
  hop: number;
  flags: NodeFlags;
  center: boolean;
}

const HEAD_H = 22;

function describe(idx: GraphIndex, id: string) {
  const n = nodeOf(idx, id);
  if (!n) return null;
  if (n.type === "route")
    return {
      icon: "route" as const,
      title: n.route.path,
      method: n.route.method,
      sub: `${n.route.file}:${n.route.line}`,
      kind: "route",
      file: n.route.file,
    };
  if (n.type === "table")
    return {
      icon: "table" as const,
      title: n.table.name,
      method: null,
      sub: `${n.table.source} · ${n.table.columns.length} columns`,
      kind: "table",
      file: n.table.file,
    };
  return {
    icon: n.symbol.kind,
    title: n.symbol.qualifiedName,
    method: null,
    sub: `${n.symbol.file}:${n.symbol.startLine}`,
    kind: n.symbol.kind,
    file: n.symbol.file,
  };
}

const hopWord = (h: number) =>
  h === 0
    ? "in focus"
    : h < 0
      ? `caller, ${-h} hop${h < -1 ? "s" : ""} away`
      : `callee, ${h} hop${h > 1 ? "s" : ""} away`;

interface Props {
  idx: GraphIndex;
  focus: Focus;
  flagsOf: (id: string, file: string) => NodeFlags;
  selectedId: string | null;
  fitKey: string;
  onPick: (id: string) => void;
  onClear: () => void;
  empty: React.ReactNode;
}

export function FocusCanvas({
  idx,
  focus,
  flagsOf,
  selectedId,
  fitKey,
  onPick,
  onClear,
  empty,
}: Props) {
  const { nodes, edges } = useMemo(() => {
    const placed = layoutColumns(focus.columns);
    const out: Node[] = [];
    let stop = true;
    for (const p of placed.nodes) {
      const d = describe(idx, p.id);
      if (!d) continue;
      const hop = focus.hop.get(p.id) ?? 0;
      const flags = flagsOf(p.id, d.file);
      const label = [
        d.method ? `${d.method} ${d.title}` : d.title,
        d.kind,
        d.sub,
        hopWord(hop),
        flags.edited ? "changed by the agent" : flags.read ? "read by the agent" : "",
      ]
        .filter(Boolean)
        .join(", ");
      out.push({
        id: p.id,
        type: "card",
        position: { x: p.x, y: p.y + HEAD_H + 10 },
        data: {
          icon: d.icon,
          title: d.title,
          method: d.method,
          sub: d.sub,
          hop,
          flags,
          center: hop === 0,
        } satisfies CardData,
        style: { width: NODE_W, height: NODE_H },
        selected: p.id === selectedId,
        ...nodeA11y(label, stop),
      });
      stop = false;
    }
    focus.columns.forEach((ids, c) => {
      if (!ids.length) return;
      const h = c - focus.centerColumn;
      out.push({
        id: `head:${c}`,
        type: "head",
        position: { x: c * (NODE_W + 168), y: 0 },
        data: {
          text:
            h === 0
              ? "Focus"
              : h < 0
                ? `Callers · ${-h} hop${h < -1 ? "s" : ""}`
                : `Callees · ${h} hop${h > 1 ? "s" : ""}`,
          count: ids.length,
        },
        style: { width: NODE_W, height: HEAD_H },
        selectable: false,
        ...quietNode,
      });
    });
    const flow: Edge[] = focus.edges.map((e) => {
      const possible = e.certainty === "possible";
      const near = focus.hop.get(e.from) === 0 || focus.hop.get(e.to) === 0;
      return {
        id: `${e.from}->${e.to}:${e.kind}`,
        source: e.from,
        target: e.to,
        type: "default",
        focusable: false,
        label: possible ? "possible" : undefined,
        labelStyle: { fontSize: 11, fill: "var(--muted)" },
        labelBgStyle: { fill: "var(--bg)", fillOpacity: 1 },
        labelBgPadding: [5, 2],
        labelBgBorderRadius: 4,
        style: {
          stroke: near ? "var(--text-2)" : "var(--faint)",
          strokeWidth: near ? 1.5 : 1.2,
          strokeDasharray: possible ? "5 4" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: near ? "var(--text-2)" : "var(--faint)",
        },
      };
    });
    return { nodes: out, edges: flow };
  }, [idx, focus, flagsOf, selectedId]);

  return (
    <Board
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitKey={fitKey}
      fitMinZoom={0.85}
      onNodeClick={(n) => n.type === "card" && onPick(n.id)}
      onPaneClick={onClear}
      empty={empty}
      legend={
        <>
          <span className="lg edit">changed by the agent</span>
          <span className="lg read">read by the agent</span>
          <span className="lg line">resolved call</span>
          <span className="lg dashed">possible call</span>
        </>
      }
    />
  );
}

function Card({ data, selected }: NodeProps) {
  const d = data as CardData;
  const cls = [
    "map-node",
    d.center ? "center" : "",
    selected ? "selected" : "",
    d.flags.edited ? "edited" : d.flags.read ? "read" : "",
  ].join(" ");
  return (
    <div className={cls}>
      <Handle type="target" position={Position.Left} className="h" />
      <span className="mn-icon">
        <KindIcon kind={d.icon} />
      </span>
      <span className="mn-main">
        <span className="mn-title">
          {d.method && <b className={`verb v-${d.method.toLowerCase()}`}>{d.method}</b>}
          <span className="mono">{d.title}</span>
        </span>
        <span className="mn-sub mono">{d.sub}</span>
      </span>
      <span className="mn-badges">
        {d.flags.isNew && <i className="b new">new</i>}
        {d.flags.edited && <i className="b edit">changed</i>}
        {!d.flags.edited && d.flags.read && <i className="b read">read</i>}
        {d.hop !== 0 && <i className="b hop">{`${d.hop < 0 ? "←" : "→"}${Math.abs(d.hop)}`}</i>}
      </span>
      <Handle type="source" position={Position.Right} className="h" />
    </div>
  );
}

function Head({ data }: NodeProps) {
  const d = data as { text: string; count: number };
  return (
    <div className="map-head">
      {d.text}
      <span>{d.count}</span>
    </div>
  );
}

const nodeTypes = { card: Card, head: Head };
