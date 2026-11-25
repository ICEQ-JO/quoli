import { type Edge, Handle, MarkerType, type Node, type NodeProps, Position } from "@xyflow/react";
import { useMemo } from "react";
import { nodeA11y } from "../../a11y.ts";
import { Board } from "../Board.tsx";
import { type PlacedNode, relationLabel, visibleRelationships } from "./exploration.ts";
import { fileOfNode, type GraphIndex, nodeOf } from "./graph.ts";
import { type IconKind, KindIcon } from "./KindIcon.tsx";

export interface NodeFlags {
  edited: boolean;
  fileEdited: boolean;
  read: boolean;
}
interface CardData extends Record<string, unknown> {
  name: string;
  file: string;
  icon: IconKind;
  flags: NodeFlags;
}
export function describeNode(idx: GraphIndex, id: string) {
  const n = nodeOf(idx, id);
  if (!n) return null;
  return {
    id,
    kind: n.type,
    name:
      n.type === "symbol"
        ? n.symbol.qualifiedName
        : n.type === "route"
          ? `${n.route.method} ${n.route.path}`
          : n.table.name,
    file: fileOfNode(n),
    line:
      n.type === "symbol" ? n.symbol.startLine : n.type === "route" ? n.route.line : n.table.line,
    icon: (n.type === "symbol" ? n.symbol.kind : n.type) as IconKind,
  };
}

export function CodeCanvas({
  idx,
  placed,
  selected,
  pick,
  flagsOf,
  fitKey,
}: {
  idx: GraphIndex;
  placed: PlacedNode[];
  selected: string | null;
  pick: (id: string) => void;
  flagsOf: (id: string, file: string) => NodeFlags;
  fitKey: string;
}) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = placed.flatMap((p, i) => {
      const d = describeNode(idx, p.id);
      if (!d) return [];
      const flags = flagsOf(p.id, d.file);
      return [
        {
          id: p.id,
          type: "code",
          position: { x: p.x, y: p.y },
          selected: selected === p.id,
          data: {
            name: d.name,
            file: `${d.file}:${d.line}`,
            icon: d.icon,
            flags,
          } satisfies CardData,
          style: { width: 240, height: 82 },
          ...nodeA11y(
            `${d.name}, ${d.file}:${d.line}${flags.fileEdited ? ", file edited in this session" : ""}`,
            i === 0,
          ),
        },
      ];
    });
    const edges: Edge[] = visibleRelationships(idx, placed).map((e, i) => ({
      id: `${e.from}:${e.to}:${e.kind}:${e.access ?? ""}:${i}`,
      source: e.from,
      target: e.to,
      label: `${e.certainty === "possible" ? "possible " : ""}${relationLabel(e)}`,
      type: "default",
      focusable: false,
      style: {
        stroke: "var(--muted)",
        strokeDasharray: e.certainty === "possible" ? "5 4" : undefined,
      },
      labelStyle: { fill: "var(--text-2)", fontSize: 11 },
      labelBgStyle: { fill: "var(--panel)" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted)", width: 16, height: 16 },
    }));
    return { nodes, edges };
  }, [idx, placed, selected, flagsOf]);
  return (
    <Board
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitKey={fitKey}
      fitMinZoom={1}
      onNodeClick={(n) => pick(n.id)}
      legend={
        <>
          <span>Static source relationships</span>
          <span className="lg edit">file edited</span>
          <span>Dashed: possible</span>
        </>
      }
    />
  );
}
function CodeCard({ data, selected }: NodeProps<Node<CardData>>) {
  return (
    <div
      className={`cx-node ${selected ? "is-selected" : ""} ${data.flags.fileEdited ? "is-edited" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <div>
        <KindIcon kind={data.icon} />
        <strong title={data.name}>{data.name}</strong>
      </div>
      <small title={data.file}>{data.file}</small>
      {data.flags.edited ? (
        <span>Edit text matched here · derived</span>
      ) : data.flags.fileEdited ? (
        <span>File edited · recorded</span>
      ) : data.flags.read ? (
        <span>File read · recorded</span>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { code: CodeCard };
