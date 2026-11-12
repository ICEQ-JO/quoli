import {
  BackgroundVariant,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
} from "@xyflow/react";
import { useMemo, useState } from "react";
import type { Service, ServiceKind } from "../../../shared/model.ts";
import { nodeA11y, plural, quietNode } from "../a11y.ts";
import { bytes } from "../format.ts";
import { editedUnder, isSelected, type LensContext } from "../state.ts";
import { Board } from "./Board.tsx";
import { InfraGuide } from "./infra/InfraGuide.tsx";
import "./infra/infra.css";

const TIER: Record<ServiceKind, number> = {
  pipeline: 0,
  web: 1,
  api: 2,
  worker: 2,
  container: 2,
  function: 2,
  database: 3,
  cache: 3,
  queue: 3,
  external: 4,
};
const TIER_NAMES = ["Delivery", "Frontends", "Services", "Data", "Third-party"];
const ICON: Record<ServiceKind, string> = {
  pipeline: "⟳",
  web: "◫",
  api: "⌁",
  worker: "⚙",
  container: "▣",
  function: "λ",
  database: "⛁",
  cache: "◇",
  queue: "≡",
  external: "↗",
};
const W = 236;
const GAP = 90;

type Positions = Record<string, { x: number; y: number }>;

const load = (root: string | null): Positions => {
  try {
    return JSON.parse(localStorage.getItem(`quoli.infra.${root}`) ?? "{}");
  } catch {
    return {};
  }
};

export function InfraLens(ctx: LensContext) {
  const { infra, touched, selection, select, root, session } = ctx;
  const [moved, setMoved] = useState<Positions>(() => load(root));

  const { nodes, edges } = useMemo(() => {
    if (!infra) return { nodes: [], edges: [] };
    // Three columns read left → right: how code ships, what runs it, what it depends on.
    const nodes: Node[] = [];
    let first = true;
    const used = [...new Set(infra.services.map((s) => TIER[s.kind]))].sort();
    const columns = [[0], [1, 2], [3, 4]]
      .map((tiers) => tiers.filter((t) => used.includes(t)))
      .filter((tiers) => tiers.length);
    columns.forEach((tiers, col) => {
      let y = 0;
      for (const tier of tiers) {
        nodes.push({
          id: `tier:${tier}`,
          type: "tier",
          position: { x: col * (W + GAP), y },
          data: { label: TIER_NAMES[tier] },
          draggable: false,
          ...quietNode,
        });
        y += 32;
        for (const s of infra.services.filter((x) => TIER[x.kind] === tier)) {
          nodes.push({
            id: s.id,
            type: "service",
            position: moved[s.id] ?? { x: col * (W + GAP), y },
            data: {
              service: s,
              changed: editedUnder(touched, s.sourceDir),
              selected: isSelected(selection, "service", s.id),
            },
            style: { width: W },
            width: W,
            height: s.basis === "inferred" ? 150 : 128,
            ...nodeA11y(serviceLabel(s, editedUnder(touched, s.sourceDir).length), first),
          });
          first = false;
          // Long names wrap onto extra lines, so leave room for them.
          y +=
            (s.basis === "inferred" ? 172 : 150) +
            Math.max(0, Math.ceil(s.name.length / 16) - 1) * 20;
        }
        y += 28;
      }
    });
    const edges: Edge[] = infra.links.map((l) => {
      const color =
        l.kind === "deploys" ? "var(--ok)" : l.kind === "calls" ? "var(--muted)" : "var(--text-2)";
      return {
        id: `${l.from}->${l.to}`,
        source: l.from,
        target: l.to,
        focusable: false,
        style: {
          stroke: color,
          strokeWidth: 1.4,
          strokeDasharray: l.basis === "inferred" ? "5 4" : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      };
    });
    return { nodes, edges };
  }, [infra, touched, selection, moved]);

  return (
    <div className="infra-lens">
      <div className="infra-board">
        <Board
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          draggable
          variant={BackgroundVariant.Dots}
          fitKey={`infra:${root}:${infra?.services.length ?? 0}:${session?.id ?? ""}`}
          onNodeClick={(n) => n.type === "service" && select({ kind: "service", id: n.id })}
          onNodeDragStop={(n) => {
            const next = { ...moved, [n.id]: n.position };
            setMoved(next);
            try {
              localStorage.setItem(`quoli.infra.${root}`, JSON.stringify(next));
            } catch {}
          }}
          onPaneClick={() => select(null)}
          empty={infra ? null : "Reading infrastructure files…"}
          legend={
            <>
              <span className="lg line">declared in config</span>
              <span className="lg dashed">inferred</span>
              <span className="lg deploys">deploys</span>
              <span className="lg changed">code changed by this session</span>
              <span>Drag cards to arrange</span>
            </>
          }
        />
      </div>
      {infra && infra.services.length <= 2 && <InfraGuide infra={infra} />}
    </div>
  );
}

function serviceLabel(s: Service, changed: number): string {
  const parts = [s.name, `${s.kind} on ${s.platform}`];
  if (s.metrics) parts.push(`${s.metrics.state}`);
  if (s.sourceDir !== null) parts.push(`source ${s.sourceDir || "repository root"}`);
  if (changed) parts.push(`${plural(changed, "file")} changed by this session`);
  if (s.basis === "inferred") parts.push("inferred");
  return parts.join(", ");
}

function ServiceNode({ data }: NodeProps) {
  const {
    service: s,
    changed,
    selected,
  } = data as { service: Service; changed: string[]; selected: boolean };
  return (
    <div
      className={`service-node kind-${s.kind} ${changed.length ? "changed" : ""} ${selected ? "selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="h" />
      <div className="svc-head">
        <span className="svc-icon">{ICON[s.kind]}</span>
        <span className="svc-name" title={s.name}>
          {s.name}
        </span>
        <span className="svc-platform">{s.platform}</span>
      </div>
      <div className="svc-sub">
        <span>{s.kind}</span>
        {s.sourceDir !== null && <span className="mono">{s.sourceDir || "./"}</span>}
        {s.ports.length > 0 && (
          <span className="mono">:{s.ports.map((p) => p.split(":")[0]).join(", :")}</span>
        )}
      </div>
      <div className="svc-metrics">
        {s.metrics ? (
          <>
            <span className={`state ${s.metrics.state === "running" ? "up" : ""}`}>
              {s.metrics.state}
            </span>
            <span>CPU {s.metrics.cpuPercent?.toFixed(1) ?? "—"}%</span>
            <span>MEM {bytes(s.metrics.memoryBytes)}</span>
          </>
        ) : (
          <span className="faint">No live metrics</span>
        )}
      </div>
      {changed.length > 0 && (
        <div className="svc-changed">
          ✎ {plural(changed.length, "file")} changed by this session
        </div>
      )}
      {s.basis === "inferred" && (
        <div className="svc-basis" title={`inferred from ${s.evidence}`}>
          inferred from {s.evidence}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="h" />
    </div>
  );
}

function TierNode({ data }: NodeProps) {
  return <div className="tier-node">{(data as { label: string }).label}</div>;
}

const nodeTypes = { service: ServiceNode, tier: TierNode };
