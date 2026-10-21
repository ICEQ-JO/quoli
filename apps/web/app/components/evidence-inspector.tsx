import type { Relationship, StoredEvent } from "@traceframe/schema";
import { clock, number } from "@traceframe/ui";
import { eventTitle, eventTone } from "../review";
import { Icon } from "./ui-icon";

type Props = {
  event: StoredEvent | null;
  links: Relationship[];
  loading: boolean;
  copied: boolean;
  copyError: boolean;
  onCopy: () => void;
  onFollow: (id: string) => void;
};
export function EvidenceInspector({
  event,
  links,
  loading,
  copied,
  copyError,
  onCopy,
  onFollow,
}: Props) {
  if (loading)
    return (
      <div className="inspector-loading" role="status">
        Loading observation…
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
    );
  if (!event)
    return (
      <div className="inspector-empty">
        <Icon name="search" size={26} />
        <h3>Inspect an observation</h3>
        <p>Select an activity to read its captured payload and follow the evidence.</p>
        <span>Use ↑ and ↓ to move through activity.</span>
      </div>
    );
  const p = event.payload;
  return (
    <>
      <div className="inspector-head">
        <span className="basis recorded">Recorded observation</span>
        <button
          type="button"
          className="icon-button"
          onClick={onCopy}
          aria-label={copied ? "Evidence link copied" : "Copy evidence link"}
          title="Copy evidence link"
        >
          <Icon name={copied ? "check" : "link"} size={17} />
        </button>
      </div>
      <div className="inspector-intro">
        <h3>{eventTitle(event)}</h3>
        <div className="event-identity">
          <code>{event.id}</code>
          <span>·</span>
          <time>{clock(event.sourceTime)} UTC</time>
          {p.kind === "tool_result" && p.exitCode !== null && (
            <span className={`result-label ${eventTone(event)}`}>exit {p.exitCode}</span>
          )}
        </div>
      </div>
      <div className="copy-feedback" role="status" aria-live="polite">
        {copied
          ? "Local evidence link copied."
          : copyError
            ? "Copy unavailable. Use the link in your address bar."
            : ""}
      </div>
      <section className="payload-section">
        <div className="section-heading">
          <h4>
            {p.kind === "prompt"
              ? "Developer prompt"
              : p.kind === "tool_call"
                ? "Requested input"
                : p.kind === "tool_result"
                  ? "Reported output"
                  : "Captured payload"}
          </h4>
          <span className="content-state">{"content" in p ? p.content.state : "metadata"}</span>
        </div>
        <pre
          className={`payload ${p.kind === "tool_result" && p.status === "failure" ? "failed-output" : ""}`}
        >
          <code>
            {"content" in p
              ? (p.content.text ?? `[Content ${p.content.state}]`)
              : JSON.stringify(p, null, 2)}
          </code>
        </pre>
        {"content" in p && (
          <p className="payload-footnote">
            {p.content.originalBytes === null
              ? "Original size unavailable"
              : `${number(p.content.originalBytes)} original bytes`}{" "}
            · capture policy v{event.policyVersion}
          </p>
        )}
      </section>
      <section className="linked-section">
        <div className="section-heading">
          <h4>Related evidence</h4>
          <span>{links.length}</span>
        </div>
        {links.length ? (
          links.map((r) => (
            <div key={r.id} className="evidence-link">
              <span className="basis derived">Derived · explicit ID match</span>
              <button
                type="button"
                onClick={() => onFollow(r.subjectId === event.id ? r.objectId : r.subjectId)}
              >
                {r.subjectId === event.id
                  ? "Open matching tool result"
                  : "Open matching tool request"}
                <Icon name="arrow" size={16} />
              </button>
              <p>{r.uncertainty}</p>
              <details>
                <summary>How this link was established</summary>
                <code>{r.rule}</code>
                <p>Supporting observations: {r.evidenceIds.join(", ")}</p>
              </details>
            </div>
          ))
        ) : (
          <p className="supporting-text">
            No explicit link in the retained history. Nearby events alone do not establish a
            relationship.
          </p>
        )}
      </section>
      <details className="source-details">
        <summary>
          Source & provenance <span>Recorded</span>
        </summary>
        <dl className="metadata">
          <div>
            <dt>Source</dt>
            <dd>{event.source === "synthetic" ? "Synthetic fixture" : event.source}</dd>
          </div>
          <div>
            <dt>Source locator</dt>
            <dd>{event.sourceLocator ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Received at</dt>
            <dd>{clock(event.receivedAt)} UTC</dd>
          </div>
          <div>
            <dt>Receipt sequence</dt>
            <dd>#{event.sequence}</dd>
          </div>
          <div>
            <dt>Tool ID</dt>
            <dd>{event.toolId ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Prompt ID</dt>
            <dd>{event.promptId ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Adapter</dt>
            <dd>{event.adapterVersion}</dd>
          </div>
        </dl>
      </details>
      <details className="source-details raw-details">
        <summary>Normalized record</summary>
        <pre>{JSON.stringify(event, null, 2)}</pre>
      </details>
      <p className="inspector-caution">
        <Icon name="alert" size={15} />A reported result does not establish feature correctness.
        Captured text is never executed.
      </p>
    </>
  );
}
