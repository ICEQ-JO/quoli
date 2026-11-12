import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { type ReactNode, useEffect, useRef } from "react";
import { useTheme } from "../theme.ts";
import "@xyflow/react/dist/style.css";

interface BoardProps {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  /** When this key changes the view refits; `focus` limits the fit to those node ids. */
  fitKey: string;
  focus?: string[];
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
  useEffect(() => {
    if (!p.nodes.length || fitted.current === p.fitKey) return;
    fitted.current = p.fitKey;
    const focus = p.focus?.length ? p.focus.map((id) => ({ id })) : undefined;
    requestAnimationFrame(() =>
      flow.fitView({ nodes: focus, padding: 0.12, duration: 350, maxZoom: focus ? 1.1 : 1 }),
    );
  }, [p.fitKey, p.nodes.length, p.focus, flow]);

  return (
    <div className="board">
      <ReactFlow
        nodes={p.nodes}
        edges={p.edges}
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
