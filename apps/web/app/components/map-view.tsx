"use client";
import type { ChangeMap, MapNode } from "@traceframe/schema/map";
import { useEffect, useState } from "react";
import { Icon } from "./ui-icon";

type Props = {
  project: string;
  session: string;
  before: string;
  after: string;
  refresh: number;
  onEvidence: (id: string) => void;
  onOpenChange: (file: string, pair: { before: string; after: string }) => void;
  onOpenChanges: () => void;
};

async function mapRead(
  project: string,
  session: string,
  beforeId: string | null,
  afterId: string | null,
  nodes: number,
  signal?: AbortSignal,
): Promise<ChangeMap> {
  const response = await fetch("/api/map", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project,
      session,
      query: { beforeId, afterId, nodes, edges: nodes * 2 },
    }),
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Change map unavailable.");
  return data;
}

const truncate = (value: string, max = 26) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

export function MapView({
  project,
  session,
  before,
  after,
  refresh,
  onEvidence,
  onOpenChange,
  onOpenChanges,
}: Props) {
  const [map, setMap] = useState<ChangeMap | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState(100);
  const [pair, setPair] = useState<{ before: string; after: string } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh reloads the retained map projection.
  useEffect(() => {
    const abort = new AbortController();
    setMap(null);
    setError("");
    setLoading(true);
    mapRead(project, session, before || null, after || null, nodes, abort.signal)
      .then((data) => {
        if (abort.signal.aborted) return;
        setMap(data);
        setPair({ before: data.window.before ?? "", after: data.window.after });
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [project, session, before, after, nodes, refresh]);

  if (loading)
    return (
      <div className="view-loading" role="status">
        Loading change map…
      </div>
    );
  if (error)
    return (
      <div className="error-notice" role="alert">
        <Icon name="alert" />
        <div>
          <strong>Change map unavailable</strong>
          <p>{error}</p>
        </div>
        <button className="text-button" type="button" onClick={onOpenChanges}>
          Open captured changes
          <Icon name="arrow-right" size={14} />
        </button>
      </div>
    );
  if (!map)
    return (
      <div className="view-loading" role="status">
        Change map unavailable.
      </div>
    );

  const files = map.nodes.filter((node) => node.kind === "file");
  const checks = map.nodes.filter((node) => node.kind === "check");
  const position = new Map<string, { x: number; y: number }>();
  files.forEach((node, index) => {
    position.set(node.id, { x: 150, y: 34 + index * 42 });
  });
  checks.forEach((node, index) => {
    position.set(node.id, { x: 660, y: 34 + index * 42 });
  });
  const height = Math.max(files.length, checks.length, 1) * 42 + 48;
  const nodeById = new Map(map.nodes.map((node) => [node.id, node]));
  const open = (node: MapNode) => {
    if (node.kind === "file" && pair) onOpenChange(node.ref, pair);
    else onEvidence(node.ref);
  };
  return (
    <section className="map-view" aria-label="Change map">
      <div className="map-header">
        <div>
          <h2>Change map</h2>
          <p>
            {map.nodes.length} nodes · {map.edges.length} connections · captured changes joined to
            recorded checks by explicit references only.
          </p>
        </div>
        <button className="text-button" type="button" onClick={onOpenChanges}>
          Open captured changes
          <Icon name="arrow-right" size={14} />
        </button>
      </div>
      <p className="document-muted">{map.uncertainty}</p>
      {(map.omittedNodes > 0 || map.omittedEdges > 0) && (
        <p className="document-muted">
          Bounded view: {map.omittedNodes} nodes and {map.omittedEdges} connections are not shown.
          Limits are {map.caps.nodes} nodes and {map.caps.edges} connections.
          {map.nodes.length >= map.caps.nodes && (
            <>
              {" "}
              <button
                className="text-button"
                type="button"
                onClick={() => setNodes((n) => Math.min(n * 2, 500))}
              >
                Show more
              </button>
            </>
          )}
        </p>
      )}
      <div className="map-canvas">
        <div className="map-stage" style={{ height }}>
          <svg
            viewBox={`0 0 900 ${height}`}
            aria-hidden="true"
            focusable="false"
            className="map-graph"
          >
            {map.edges.map((edge) => {
              const from = position.get(edge.from);
              const to = position.get(edge.to);
              if (!from || !to) return null;
              const middle = (from.x + to.x) / 2;
              return (
                <path
                  key={edge.id}
                  className={`map-edge ${edge.position}`}
                  d={`M ${from.x} ${from.y} C ${middle} ${from.y}, ${middle} ${to.y}, ${to.x} ${to.y}`}
                  fill="none"
                />
              );
            })}
          </svg>
          <div className="map-node-layer">
            {map.nodes.map((node) => {
              const at = position.get(node.id);
              if (!at) return null;
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`map-node ${node.kind} ${node.status}`}
                  style={{ left: at.x, top: at.y }}
                  onClick={() => open(node)}
                >
                  <i aria-hidden="true" />
                  <span className="map-node-label">{truncate(node.label)}</span>
                  <span className="map-node-status">{node.status}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="map-lists">
        <section aria-label="Captured files">
          <h3>Captured files</h3>
          {files.length ? (
            <ul>
              {files.map((node) => (
                <li key={node.id}>
                  <button type="button" onClick={() => open(node)}>
                    <Icon name="file" size={14} />
                    {node.label}
                    <span>{node.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="document-muted">No captured file changed between these two captures.</p>
          )}
        </section>
        <section aria-label="Recorded checks">
          <h3>Recorded checks</h3>
          {checks.length ? (
            <ul>
              {checks.map((node) => (
                <li key={node.id}>
                  <button type="button" onClick={() => open(node)}>
                    <Icon name="terminal" size={14} />
                    {node.label}
                    <span>{node.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="document-muted">
              No command result is recorded for this session. That is not evidence that no testing
              happened.
            </p>
          )}
        </section>
      </div>
      <section aria-label="Connections">
        <h3>Connections</h3>
        {map.edges.length ? (
          <ul>
            {map.edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              return (
                <li key={edge.id}>
                  <button
                    type="button"
                    onClick={() => onEvidence(edge.evidenceIds[0])}
                    aria-label={`Open evidence for ${from?.label ?? "file"} and ${to?.label ?? "check"}`}
                  >
                    <span className="map-edge-route">
                      {from?.label} <Icon name="arrow" size={13} /> {to?.label}
                    </span>
                    <span className="map-edge-meta">
                      {edge.basis} · {edge.rule} · referenced {edge.position}
                    </span>
                    <span className="map-edge-note">{edge.uncertainty}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="document-muted">
            No explicit reference joins a captured change to a recorded check in this pair.
          </p>
        )}
      </section>
    </section>
  );
}
