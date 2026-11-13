import {
  BackgroundVariant,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
} from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import type { Service, ServiceKind } from "../../../shared/model.ts";
import { nodeA11y, plural, quietNode } from "../a11y.ts";
import { bytes } from "../format.ts";
import { editedUnder, isSelected, type LensContext } from "../state.ts";
import { Board } from "./Board.tsx";
import { InfraGuide } from "./infra/InfraGuide.tsx";
import { ServiceForm } from "./infra/ServiceForm.tsx";
import { isAdded, type Pipeline, providers, splitInfra } from "./infra/split.ts";
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
const ICON: Record<ServiceKind, React.ReactNode> = {
  pipeline: <path d="M3 8a5 5 0 019-3M13 8a5 5 0 01-9 3M12 2.5V5H9.5M4 13.5V11h2.5" />,
  web: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M2.5 6h11" />
    </>
  ),
  api: <path d="M5.5 4L2.5 8l3 4M10.5 4l3 4-3 4" />,
  worker: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2M4.1 4.1l1.4 1.4M10.5 10.5l1.4 1.4M4.1 11.9l1.4-1.4M10.5 5.5l1.4-1.4" />
    </>
  ),
  container: (
    <>
      <path d="M8 2.5l5 2.7v5.6L8 13.5l-5-2.7V5.2z" />
      <path d="M3 5.2l5 2.7 5-2.7M8 7.9v5.6" />
    </>
  ),
  function: <path d="M6 13.5c1.5 0 2-1 2.3-3L9.7 5c.3-1.6.9-2.5 2.3-2.5M5.5 7.5h5" />,
  database: (
    <>
      <ellipse cx="8" cy="4.5" rx="4.5" ry="1.8" />
      <path d="M3.5 4.5v7c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8v-7M3.5 8c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8" />
    </>
  ),
  cache: <path d="M8 2.5l5.5 5.5L8 13.5 2.5 8z" />,
  queue: <path d="M3 4.5h10M3 8h10M3 11.5h10" />,
  external: <path d="M6.5 3.5h-3v9h9v-3M9 3h4v4M13 3L7.5 8.5" />,
};

function KindIcon({ kind }: { kind: ServiceKind }) {
  return (
    <svg className="svc-icon" viewBox="0 0 16 16" aria-hidden="true">
      {ICON[kind]}
    </svg>
  );
}

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
  const { infra, touched, selection, select, root, session, projectId, refreshInfra } = ctx;
  const [moved, setMoved] = useState<Positions>(() => load(root));
  // Rendered card heights. Cards stack by their real height once measured, so a card with live
  // metrics or a long name never overlaps the one below it.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const measured = useCallback((id: string, h: number) => {
    setHeights((prev) => (Math.abs((prev[id] ?? 0) - h) < 1 ? prev : { ...prev, [id]: h }));
  }, []);

  const split = useMemo(() => (infra ? splitInfra(infra) : null), [infra]);
  const { nodes, edges } = useMemo(() => {
    if (!infra || !split) return { nodes: [], edges: [] };
    const running = split.services;
    const runningIds = new Set(running.map((s) => s.id));
    // Two columns read left → right: what runs the code, what it depends on. Pipelines are
    // listed beside the board, not drawn as running services.
    const nodes: Node[] = [];
    let first = true;
    const used = [...new Set(running.map((s) => TIER[s.kind]))].sort();
    const columns = [
      [1, 2],
      [3, 4],
    ]
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
        for (const s of running.filter((x) => TIER[x.kind] === tier)) {
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
            ...nodeA11y(serviceLabel(s, editedUnder(touched, s.sourceDir).length), first),
          });
          first = false;
          // Until a card is measured, estimate: long names and live metrics wrap onto extra lines.
          y +=
            (heights[s.id] ??
              (s.basis === "inferred" || isAdded(s) ? 150 : 128) +
                (s.metrics ? 70 : 0) +
                Math.max(0, Math.ceil(s.name.length / 16) - 1) * 20) + 22;
        }
        y += 28;
      }
    });
    const edges: Edge[] = infra.links
      .filter((l) => runningIds.has(l.from) && runningIds.has(l.to))
      .map((l) => {
        const color =
          l.kind === "deploys"
            ? "var(--ok)"
            : l.kind === "calls"
              ? "var(--muted)"
              : "var(--text-2)";
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
  }, [infra, split, touched, selection, moved, heights]);

  return (
    <div className="infra-lens">
      <div className="infra-grid">
        <div className="infra-board">
          <Board
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            draggable
            onMeasured={measured}
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
            empty={
              infra
                ? split?.services.length
                  ? null
                  : "No running services found in this repository's files. Add one by hand from the side panel."
                : "Reading infrastructure files…"
            }
            legend={
              <>
                <span className="lg line">declared in config</span>
                <span className="lg dashed">inferred</span>
                <span className="lg changed">code changed by this session</span>
                <span>Drag cards to arrange</span>
              </>
            }
          />
        </div>
        {infra && split && (
          <InfraSide
            pipelines={split.pipelines}
            infra={infra}
            selectedId={selection?.kind === "service" ? selection.id : null}
            select={(id) => select({ kind: "service", id })}
            projectId={projectId}
            onAdded={refreshInfra}
          />
        )}
        {infra && split && split.services.length <= 2 && <InfraGuide infra={infra} />}
      </div>
    </div>
  );
}

function InfraSide({
  pipelines,
  infra,
  selectedId,
  select,
  projectId,
  onAdded,
}: {
  pipelines: Pipeline[];
  infra: NonNullable<LensContext["infra"]>;
  selectedId: string | null;
  select: (id: string) => void;
  projectId: string;
  onAdded: () => void;
}) {
  const list = providers(infra);
  const [adding, setAdding] = useState(false);
  return (
    <aside className="infra-side" aria-label="Pipelines and connections">
      <section>
        <h3>
          Checks and pipelines <span className="sec-count">{pipelines.length}</span>
        </h3>
        <p className="side-note">
          Workflows that build, test or deploy. They run on the CI host, not here; Quoli reads the
          workflow files, not their runs.
        </p>
        {pipelines.length === 0 ? (
          <p className="faint">No workflow files found.</p>
        ) : (
          <ul className="pipes">
            {pipelines.map((p) => (
              <li key={p.service.id}>
                <button
                  type="button"
                  className={`pipe ${selectedId === p.service.id ? "selected" : ""}`}
                  onClick={() => select(p.service.id)}
                  title={p.service.evidence}
                >
                  <KindIcon kind="pipeline" />
                  <span className="pipe-main">
                    <b>{p.service.name}</b>
                    <span className="faint mono">{p.service.evidence}</span>
                    <span className="pipe-what">
                      {p.deploys.length
                        ? `Deploys ${p.deploys.map((d) => d.name).join(", ")} (inferred from its steps)`
                        : "Checks only: no deploy step recognised"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>
          Hosted connections
          {!adding && (
            <button type="button" className="btn sm side-add" onClick={() => setAdding(true)}>
              Add service
            </button>
          )}
        </h3>
        <p className="side-note">
          Add any place your app runs by hand: no keys, no connection. Live status and metrics need
          a provider connection, planned for roadmap phase 4; until then the board shows what your
          files declare and what you add, plus live CPU and memory for local Docker containers.
        </p>
        {adding && (
          <ServiceForm
            projectId={projectId}
            onDone={(changed) => {
              setAdding(false);
              if (changed) onAdded();
            }}
          />
        )}
        <ul className="providers">
          {list.map((p) => (
            <li key={p.id}>
              <span className="prov-name">{p.name}</span>
              <span className="prov-state">
                {p.added.length ? (
                  <span title={p.added.join("\n")}>
                    added by you: {p.added[0]}
                    {p.added.length > 1 ? ` +${p.added.length - 1}` : ""}
                  </span>
                ) : p.seenIn.length ? (
                  <span title={p.seenIn.join("\n")}>
                    mentioned in {p.seenIn[0]}
                    {p.seenIn.length > 1 ? ` +${p.seenIn.length - 1}` : ""}
                  </span>
                ) : (
                  <span className="faint">not in this repo</span>
                )}
                <span className="prov-tag">not connected</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function serviceLabel(s: Service, changed: number): string {
  const parts = [s.name, `${s.kind} on ${s.platform}`];
  if (s.metrics) parts.push(`${s.metrics.state}`);
  if (s.sourceDir !== null) parts.push(`source ${s.sourceDir || "repository root"}`);
  if (changed) parts.push(`${plural(changed, "file")} changed by this session`);
  if (s.basis === "inferred") parts.push("inferred");
  if (isAdded(s)) parts.push("added by you");
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
        <KindIcon kind={s.kind} />
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
          <span
            className="faint"
            title={
              s.platform === "docker-compose" || s.platform === "docker"
                ? "Live CPU and memory come from local Docker; this container is not running here"
                : `Live status for ${s.platform} needs a provider connection, planned for roadmap phase 4`
            }
          >
            {s.platform === "docker-compose" || s.platform === "docker"
              ? "Not running in local Docker"
              : "No live status: not connected"}
          </span>
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
      {isAdded(s) && (
        <div className="svc-basis" title="Added by you in Quoli; no file declares it">
          added by you
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
