import { type Edge, Handle, MarkerType, type Node, type NodeProps, Position } from "@xyflow/react";
import { useMemo, useState } from "react";
import type { AgentNode, ToolCall } from "../../../shared/model.ts";
import { CATEGORY, compact, duration, tokenSum } from "../format.ts";
import { isSelected, type LensContext } from "../state.ts";
import { GRAPH_FIT_ALL, GRAPH_RECENT, TIMELINE_MAX } from "./agents/helpers.ts";
import { Timeline } from "./agents/Timeline.tsx";
import { Board } from "./Board.tsx";
import "./agents/agents.css";

const COL = 210;
const LANE = 150;
const LABEL_W = 210;

type View = "timeline" | "graph";
const VIEW_KEY = "quoli.agents.view";

function storedView(): View | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "timeline" || v === "graph" ? v : null;
  } catch {
    return null;
  }
}

export function AgentsLens(ctx: LensContext) {
  const { session, calls, selection, select } = ctx;
  const [chosen, setChosen] = useState<View | null>(storedView);
  const view: View =
    chosen ?? ((session?.toolCalls.length ?? 0) <= TIMELINE_MAX ? "timeline" : "graph");
  const choose = (v: View) => {
    setChosen(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const { nodes, edges } = useMemo(() => {
    if (!session) return { nodes: [], edges: [] };
    const all = [...session.toolCalls].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const visible = new Set(calls.map((c) => c.id));
    const lanes = session.agents.filter(
      (a) => a.kind === "main" || all.some((c) => c.agentId === a.id),
    );
    const laneOf = new Map(lanes.map((a, i) => [a.id, i]));
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    lanes.forEach((agent, i) => {
      nodes.push({
        id: `lane:${agent.id}`,
        type: "lane",
        position: { x: 0, y: i * LANE },
        data: {
          agent,
          calls: all.filter((c) => c.agentId === agent.id).length,
          models: session.models,
        },
        style: { width: LABEL_W - 30 },
      });
    });

    const lastInLane = new Map<string, string>();
    all.forEach((call, i) => {
      const lane = laneOf.get(call.agentId) ?? 0;
      nodes.push({
        id: call.id,
        type: "tool",
        position: { x: LABEL_W + i * COL, y: lane * LANE },
        data: {
          call,
          selected: isSelected(selection, "tool", call.id),
          future: !visible.has(call.id),
        },
      });
      const prev = lastInLane.get(call.agentId) ?? `lane:${call.agentId}`;
      edges.push({
        id: `${prev}->${call.id}`,
        source: prev,
        target: call.id,
        type: "smoothstep",
        style: { stroke: "var(--line-strong)", strokeWidth: 1.2 },
      });
      lastInLane.set(call.agentId, call.id);
    });

    // Prompts sit above the main lane, at the first call they led to.
    session.turns.forEach((turn, t) => {
      const firstId = turn.toolCallIds[0];
      const index = firstId ? all.findIndex((c) => c.id === firstId) : all.length;
      const id = `prompt:${t}`;
      nodes.push({
        id,
        type: "prompt",
        position: { x: LABEL_W + Math.max(0, index) * COL - 10, y: -LANE * 0.95 },
        data: { text: turn.prompt, n: t + 1 },
      });
      if (firstId) {
        edges.push({
          id: `${id}->${firstId}`,
          source: id,
          target: firstId,
          targetHandle: "top",
          style: { stroke: "var(--text)", strokeWidth: 1.2, strokeDasharray: "3 3" },
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--text)" },
        });
      }
    });

    // Subagent calls → the lane they started. Matched in launch order; shown as inferred.
    const spawns = all.filter((c) => c.category === "agent");
    lanes
      .filter((a) => a.kind === "subagent")
      .forEach((agent, i) => {
        const spawn = spawns[i];
        const first = all.find((c) => c.agentId === agent.id);
        if (!spawn || !first) return;
        edges.push({
          id: `spawn:${spawn.id}`,
          source: spawn.id,
          sourceHandle: "bottom",
          target: first.id,
          targetHandle: "top",
          type: "smoothstep",
          label: "spawned",
          labelStyle: { fill: "var(--agent)", fontSize: 11 },
          labelBgStyle: { fill: "var(--bg)" },
          style: { stroke: "var(--agent)", strokeWidth: 1.4, strokeDasharray: "5 4" },
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--agent)" },
        });
      });
    return { nodes, edges };
  }, [session, calls, selection]);

  // Small graphs fit whole; larger ones open on the latest activity.
  const total = session?.toolCalls.length ?? 0;
  const recent = calls.slice(-GRAPH_RECENT).map((c) => c.id);
  const switcher = (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would need resets for a two-button switch
    <div className="view-switch" role="group" aria-label="Agents view">
      {(["timeline", "graph"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => choose(v)}>
          {v === "timeline" ? "Timeline" : "Graph"}
        </button>
      ))}
    </div>
  );
  if (view === "timeline" && session) {
    return (
      <div className="agents-lens">
        <Timeline
          session={session}
          visible={new Set(calls.map((c) => c.id))}
          selection={selection}
          cursorId={calls.at(-1)?.id ?? null}
          select={select}
        />
        <div className="ag-head">{switcher}</div>
      </div>
    );
  }
  return (
    <div className="agents-lens">
      {switcher}
      <Board
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitKey={`agents:${session?.id ?? ""}`}
        focus={total > GRAPH_FIT_ALL ? recent : undefined}
        onNodeClick={(n) => n.type === "tool" && select({ kind: "tool", id: n.id })}
        onPaneClick={() => select(null)}
        empty="Pick a session on the left to see what the agent did."
        legend={
          <>
            {(["read", "edit", "run", "search", "agent", "web"] as const).map((c) => (
              <span
                key={c}
                className="lg"
                style={{ "--c": CATEGORY[c].color } as React.CSSProperties}
              >
                {CATEGORY[c].label}
              </span>
            ))}
            <span className="lg failed">failed</span>
          </>
        }
      />
    </div>
  );
}

function ToolNode({ data }: NodeProps) {
  const { call, selected, future } = data as { call: ToolCall; selected: boolean; future: boolean };
  const cat = CATEGORY[call.category];
  return (
    <div
      className={`tool-node ${call.status} ${selected ? "selected" : ""} ${future ? "future" : ""}`}
      style={{ "--c": cat.color } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Left} className="h" />
      <Handle type="target" position={Position.Top} id="top" className="h" />
      <div className="tool-head">
        <span className="tool-name" title={call.name}>
          {call.name.replace(/^mcp__/, "")}
        </span>
        <span className="tool-status">
          {call.status === "running"
            ? "running"
            : call.status === "failed"
              ? "failed"
              : duration(call.startedAt, call.endedAt)}
        </span>
      </div>
      <div className="tool-summary">{call.summary}</div>
      <Handle type="source" position={Position.Right} className="h" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="h" />
    </div>
  );
}

function LaneNode({ data }: NodeProps) {
  const { agent, calls } = data as { agent: AgentNode; calls: number };
  return (
    <div className={`lane-node ${agent.kind}`}>
      <div className="lane-title">
        {agent.kind === "main" ? "Main agent" : `Subagent · ${agent.type ?? agent.id}`}
      </div>
      <div className="lane-meta">
        {calls} tool calls · {compact(tokenSum(agent.tokens))} tokens
      </div>
      <Handle type="source" position={Position.Right} className="h" />
    </div>
  );
}

function PromptNode({ data }: NodeProps) {
  const { text, n } = data as { text: string; n: number };
  return (
    <div className="prompt-node" title={text}>
      <span className="prompt-n">Prompt {n}</span>
      <span className="prompt-text">{text}</span>
      <Handle type="source" position={Position.Bottom} className="h" />
    </div>
  );
}

const nodeTypes = { tool: ToolNode, lane: LaneNode, prompt: PromptNode };
