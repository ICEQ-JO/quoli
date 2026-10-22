"use client";
import type { ReconciliationView } from "@traceframe/schema/reconcile";
import { number } from "@traceframe/ui";
import { Icon } from "./ui-icon";

/**
 * Cross-source reconciliation panel.
 *
 * It shows what the two live sources agree on, where they disagree and what
 * could not be joined at all. It never presents a combined total while an
 * overlap is unresolved.
 */
export function ReconciliationPanel({ view }: { view: ReconciliationView | null }) {
  if (!view)
    return (
      <p className="document-muted">
        Source reconciliation is unavailable. No cross-source view could be built from the retained
        observations.
      </p>
    );
  const corroborated = view.tools.filter((tool) => tool.sources.length > 1);
  const conflicts = view.tools.filter((tool) => tool.conflict);
  const unresolved = view.combined.input === null;
  return (
    <div className="reconciliation">
      <div className="reconciliation-totals">
        <span>
          <Icon name="box" size={14} />
          Combined input {unresolved ? "—" : number(view.combined.input)}
        </span>
        <span>
          <Icon name="box" size={14} />
          Combined output {unresolved ? "—" : number(view.combined.output)}
        </span>
        <span>
          <Icon name="check" size={14} />
          {corroborated.length} corroborated
        </span>
        <span className={conflicts.length ? "warning" : ""}>
          <Icon name="alert" size={14} />
          {conflicts.length} conflicting
        </span>
      </div>
      <p className="document-muted">
        {unresolved
          ? "The combined total stays unknown while an overlap is unresolved. The per-source totals below are reported separately."
          : "Sources are joined only by explicit identifiers inside this project. The combined total is the canonical request series, never a sum of per-source totals."}
      </p>
      {view.sourceUsage.length > 0 && (
        <ul className="reconciliation-sources">
          {view.sourceUsage.map((source) => (
            <li key={source.source}>
              <strong>{source.source}</strong>
              <span>
                {source.requests} reported requests · input {number(source.input)} · output{" "}
                {number(source.output)} · cache read {number(source.cacheRead)} · cache write{" "}
                {number(source.cacheWrite)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {view.tools.length > 0 && (
        <ul className="reconciliation-tools">
          {view.tools.map((tool) => (
            <li key={tool.toolId}>
              <span className="reconciliation-tool">
                <strong>
                  {tool.toolName} · {tool.status}
                </strong>
                <span>
                  {tool.sources.map((source) => source.source).join(" + ")}
                  {tool.conflict ? " · sources disagree" : ""}
                </span>
              </span>
              <span className="reconciliation-note">{tool.uncertainty}</span>
            </li>
          ))}
        </ul>
      )}
      {view.ambiguous.length > 0 && (
        <p className="document-muted">
          {view.ambiguous.length} recorded observations could not be joined to another source and
          stay visible as ambiguous.
        </p>
      )}
    </div>
  );
}
