import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../theme.ts";
import "@xyflow/react/dist/style.css";

interface BoardProps {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  /** When this key changes the view refits; `focus` limits the fit to those node ids. */
  fitKey: string;
  focus?: string[];
  /** The smallest zoom a fit may use, so text stays readable; wider content is panned. */
  fitMinZoom?: number;
  draggable?: boolean;
  onNodeClick?: (node: Node) => void;
  onNodeDragStop?: (node: Node) => void;
  onPaneClick?: () => void;
  variant?: BackgroundVariant;
  empty?: ReactNode;
  legend?: ReactNode;
}

export function Board(props: BoardProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner(p: BoardProps) {
  const flow = useReactFlow();
  const theme = useTheme();
  const fitted = useRef<string | null>(null);
  // Lenses rebuild their node objects on every selection change. React Flow forgets a node's
  // measured size when its object changes and keeps it hidden until measured again, which never
  // happens when the size did not change. Remember sizes and hand them back.
  const sizes = useRef(new Map<string, { width: number; height: number }>());
  const [sized, setSized] = useState(0);
  const nodes = useMemo(() => {
    void sized;
    return p.nodes.map((n) => {
      const m = sizes.current.get(n.id);
      return m && !n.measured ? { ...n, measured: m } : n;
    });
  }, [p.nodes, sized]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    let changed = false;
    for (const c of changes) {
      if (c.type === "dimensions" && c.dimensions) {
        sizes.current.set(c.id, c.dimensions);
        changed = true;
      }
    }
    if (changed) setSized((v) => v + 1);
  }, []);
  useEffect(() => {
    if (!p.nodes.length || fitted.current === p.fitKey) return;
    fitted.current = p.fitKey;
    const focus = p.focus?.length ? p.focus.map((id) => ({ id })) : undefined;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
      flow.fitView({
        nodes: focus,
        padding: 0.12,
        duration: still ? 0 : 350,
        maxZoom: focus ? 1.1 : 1,
        minZoom: p.fitMinZoom,
      }),
    );
  }, [p.fitKey, p.nodes.length, p.focus, p.fitMinZoom, flow]);

  return (
    <div className="board">
      <ReactFlow
        nodes={nodes}
        edges={p.edges}
        onNodesChange={onNodesChange}
        nodeTypes={p.nodeTypes}
        colorMode={theme}
        minZoom={0.05}
        maxZoom={2.5}
        nodesDraggable={p.draggable ?? false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeClick={(_, n) => p.onNodeClick?.(n)}
        onNodeDragStop={(_, n) => p.onNodeDragStop?.(n)}
        onPaneClick={p.onPaneClick}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background variant={p.variant ?? BackgroundVariant.Dots} gap={22} size={1.2} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      {p.legend && <div className="legend">{p.legend}</div>}
      {!p.nodes.length && p.empty && <div className="board-empty">{p.empty}</div>}
    </div>
  );
}
