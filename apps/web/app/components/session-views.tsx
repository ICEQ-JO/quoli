import type { Project, Session, UsageView } from "@traceframe/schema";
import { number } from "@traceframe/ui";
import { Icon } from "./ui-icon";
export function UsagePanel({
  usage,
  onEvidence,
}: {
  usage: UsageView;
  onEvidence: (id: string) => void;
}) {
  const inputTotal =
    usage.input !== null && usage.cacheRead !== null && usage.cacheWrite !== null
      ? usage.input + usage.cacheRead + usage.cacheWrite
      : null;
  const rows = [
    ["Non-cache input", usage.input, "New input reported outside the prompt cache."],
    ["Output", usage.output, "Output tokens reported by the source."],
    ["Cache read", usage.cacheRead, "Input tokens reported as read from cache."],
    ["Cache write", usage.cacheWrite, "Input tokens reported as written to cache."],
  ] as const;
  return (
    <section className="usage-view">
      <div className="view-intro">
        <h2>Reported usage</h2>
        <p>Counts from retained request observations. Missing data stays unknown.</p>
      </div>
      <div className="usage-layout">
        <div>
          <table className="usage-table">
            <caption className="sr-only">Reported token categories</caption>
            <thead>
              <tr>
                <th scope="col">Token category</th>
                <th scope="col">Reported tokens</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, value, meaning]) => (
                <tr key={label}>
                  <th scope="row">
                    {label}
                    <small>{meaning}</small>
                  </th>
                  <td>
                    {number(value)}
                    {value === null && <small>Not fully reported</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="usage-composition">
            <h3>Reported input composition</h3>
            {inputTotal !== null && inputTotal > 0 ? (
              <>
                <div
                  className="composition-bar"
                  role="img"
                  aria-label="Input tokens by category; exact values are listed in the table above"
                >
                  <span style={{ width: `${((usage.input ?? 0) / inputTotal) * 100}%` }} />
                  <span style={{ width: `${((usage.cacheRead ?? 0) / inputTotal) * 100}%` }} />
                  <span style={{ width: `${((usage.cacheWrite ?? 0) / inputTotal) * 100}%` }} />
                </div>
                <div className="composition-legend">
                  <span>Non-cache input</span>
                  <span>Cache read</span>
                  <span>Cache write</span>
                </div>
              </>
            ) : (
              <p>Input composition is unavailable because its counts are missing or zero.</p>
            )}
          </div>
        </div>
        <aside className="usage-explanation">
          <span className="basis derived">Derived from reported counts</span>
          <h3>Cache-read token share</h3>
          <strong>
            {usage.cacheReadShare === null
              ? "Unknown"
              : `${(usage.cacheReadShare * 100).toFixed(1)}%`}
          </strong>
          <p>cache read / (non-cache input + cache read + cache write)</p>
          <p>This measures tokens, not the percentage of requests that hit the cache.</p>
        </aside>
      </div>
      <div className={`usage-limitation ${usage.complete ? "" : "warning"}`}>
        <Icon name="info" />
        <p>
          {usage.complete
            ? "All four fields are present in retained request observations. That does not establish that every request was captured."
            : "Usage is incomplete, conflicting or unreconciled. Unknown counts are shown as —, never converted to zero."}{" "}
          No file or prompt cost allocation is implied.
        </p>
      </div>
      <section className="usage-evidence">
        <div className="section-heading">
          <h3>Inspect the source observations</h3>
          <span>{usage.requests} identified requests</span>
        </div>
        {usage.evidenceIds.length ? (
          usage.evidenceIds.map((id) => (
            <button className="usage-source" type="button" key={id} onClick={() => onEvidence(id)}>
              <Icon name="box" size={17} />
              <code>{id}</code>
              <span>Recorded request usage</span>
              <Icon name="arrow" size={16} />
            </button>
          ))
        ) : (
          <p className="supporting-text">No usage observations were retained for this session.</p>
        )}
        <details className="rule-details">
          <summary>Calculation rule</summary>
          <code>{usage.rule}</code>
          <p>
            Unique request deltas are summed deterministically. Counter samples are not added to
            request observations.
          </p>
        </details>
      </section>
    </section>
  );
}
export function CoveragePanel({
  session,
  project,
  snapshotCount = 0,
}: {
  session: Session | undefined;
  project?: Project;
  snapshotCount?: number;
}) {
  const rows = [
    [
      "Session boundaries",
      session?.ended ? "End recorded" : "End unavailable",
      "An end event does not mean every tool result was captured.",
    ],
    [
      "Command verification",
      "Feature correctness unknown",
      "A recorded exit code describes the command, not whether a feature works.",
    ],
    [
      "File changes",
      snapshotCount ? `${snapshotCount} snapshots captured` : "No snapshots captured",
      "Referenced paths are not captured diffs or evidence of exclusive authorship.",
    ],
    [
      "Agent integration",
      project?.synthetic ? "Synthetic sources only" : "No live agent connected",
      "No real agent is connected. Live Claude Code capture remains upcoming.",
    ],
    [
      "Content policy",
      project?.synthetic
        ? "Synthetic content enabled"
        : project?.policy.code
          ? "Code capture enabled"
          : "Code capture disabled",
      project?.synthetic
        ? "This fixed demo project retains authored fixtures."
        : "Repository registration controls code and untracked capture. Prompt and tool-output capture remain disabled for manual reviews.",
    ],
    [
      "Privacy",
      "Local storage",
      "No session uploads. Redaction reduces risk but cannot guarantee secret removal.",
    ],
  ];
  return (
    <section className="coverage-view">
      <div className="view-intro">
        <h2>Capture coverage</h2>
        <p>What this session can establish, and what remains unknown.</p>
      </div>
      <div className="coverage-notice">
        <Icon name="info" />
        <p>Absence of a recorded event is not proof that an action did not happen.</p>
      </div>
      <div className="coverage-list">
        {rows.map(([title, state, text]) => (
          <article key={title}>
            <h3>{title}</h3>
            <div>
              <strong>{state}</strong>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
