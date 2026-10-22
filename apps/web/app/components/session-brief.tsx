"use client";
import type { EventPage, Project, Session, StoredEvent } from "@traceframe/schema";
import type { CheckState, VerificationView } from "@traceframe/schema/checks";
import type { ReconciliationView } from "@traceframe/schema/reconcile";
import type { SnapshotPage } from "@traceframe/schema/repository";
import { number } from "@traceframe/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { eventTitle, preview, type View } from "../review";
import { ReconciliationPanel } from "./reconciliation-panel";
import { RepositoryHistory } from "./repository-history";
import { Icon } from "./ui-icon";
import { eventRead, localRead, type ReviewSummary, sourceDate } from "./workspace-data";

const checkStateLabel: Record<CheckState, string> = {
  passed: "Recorded pass",
  failed: "Recorded failure",
  unknown_output: "Counts unknown",
  missing_result: "Result missing",
};

export function SessionBrief({
  project,
  session,
  summary,
  verification,
  reconciliation,
  refresh,
  onEvidence,
  onView,
  onGaps,
  inspector,
  onDismiss,
  metadataLoading,
  metadataFailed,
  onRetry,
  onSessions,
}: {
  project: Project | undefined;
  session: Session | undefined;
  summary: ReviewSummary | null;
  verification: VerificationView | null;
  reconciliation: ReconciliationView | null;
  refresh: number;
  onEvidence: (id: string) => void;
  onView: (view: View) => void;
  onGaps: () => void;
  inspector: ReactNode | null;
  onDismiss: () => void;
  metadataLoading: boolean;
  metadataFailed: boolean;
  onRetry: () => void;
  onSessions: () => void;
}) {
  const [data, setData] = useState<{
      prompts: EventPage;
      tools: EventPage;
      gaps: EventPage;
      captures: SnapshotPage;
    } | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState("");
  const active = useRef<AbortController | null>(null);
  const projectId = project?.id,
    sessionId = session?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh/retry reload the retained review projection.
  useEffect(() => {
    const abort = new AbortController();
    active.current = abort;
    setData(null);
    setError("");
    setBusy("");
    if (!projectId || !sessionId) return () => abort.abort();
    Promise.all([
      eventRead(projectId, sessionId, "prompt", 0, abort.signal),
      eventRead(projectId, sessionId, "tools", 0, abort.signal),
      eventRead(projectId, sessionId, "gap", 0, abort.signal),
      localRead<SnapshotPage>(
        { resource: "snapshots", project: projectId, session: sessionId, order: "latest" },
        abort.signal,
      ),
    ])
      .then(([prompts, tools, gaps, captures]) => {
        if (!abort.signal.aborted) setData({ prompts, tools, gaps, captures });
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [projectId, sessionId, refresh, retry]);
  async function more(kind: "prompts" | "tools") {
    if (!data || busy || !projectId || !sessionId) return;
    const cursor = data[kind].nextCursor,
      abort = active.current;
    if (cursor === null || !abort) return;
    setBusy(kind);
    try {
      const next = await eventRead(
        projectId,
        sessionId,
        kind === "prompts" ? "prompt" : "tools",
        cursor,
        abort.signal,
      );
      if (!abort.signal.aborted)
        setData((old) =>
          old
            ? { ...old, [kind]: { ...next, events: [...old[kind].events, ...next.events] } }
            : old,
        );
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (!abort.signal.aborted) setBusy("");
    }
  }
  if (metadataFailed || (!metadataLoading && (!session || !project)))
    return (
      <section className="review-unavailable" role="status">
        <Icon name="info" size={24} />
        <h2>Session review unavailable</h2>
        <p>
          {metadataFailed
            ? "Session metadata could not load. Reconnect to the local collector and retry."
            : "This session is not available in the loaded project register. It may not exist or may be outside the 50-session view limit."}
        </p>
        <div>
          <button className="button" type="button" onClick={onRetry}>
            Retry review
          </button>
          <button className="text-button" type="button" onClick={onSessions}>
            Choose another session
            <Icon name="arrow-right" size={14} />
          </button>
        </div>
      </section>
    );
  if (error)
    return (
      <div className="error-notice" role="alert">
        <Icon name="alert" />
        <div>
          <strong>Session review unavailable</strong>
          <p>{error}</p>
        </div>
        <button type="button" className="button" onClick={() => setRetry((n) => n + 1)}>
          Retry review
        </button>
      </div>
    );
  if (!data || !session || !project)
    return (
      <div className="view-loading" role="status">
        Loading session review…
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
    );
  const latest = data.captures.snapshots[0];
  if (session.kind === "repository")
    return (
      <div className={`brief-layout ${inspector ? "inspecting-evidence" : ""}`}>
        <RepositoryHistory
          project={project.id}
          session={session}
          onView={onView}
          onEvidence={onEvidence}
        />
        {inspector ? (
          <aside className="desktop-inspector session-evidence" aria-label="Evidence inspector">
            <button type="button" className="text-button" onClick={onDismiss}>
              Close evidence inspector
            </button>
            {inspector}
          </aside>
        ) : (
          <aside className="session-properties" aria-label="Repository properties">
            <h2>Repository</h2>
            <p>{project.name}</p>
            <p>
              {project.policy.code
                ? "Code capture enabled"
                : "Metadata only: content diffs and unstaged code edits are unavailable."}
            </p>
            <p>Observation is independent of agent sessions. Agent authorship is unknown.</p>
            <button type="button" className="text-button" onClick={() => onView("Settings")}>
              Capture settings
            </button>
          </aside>
        )}
      </div>
    );
  const represented = new Set<string>();
  const toolRows: { call: StoredEvent; result: StoredEvent | null; linked: string | null }[] =
    data.tools.events
      .filter((e) => e.payload.kind === "tool_call")
      .map((call) => {
        const links =
          summary?.relationships.filter(
            (r) => r.subjectId === call.id && r.rule === "same-session-tool-id/v1",
          ) ?? [];
        const link =
          links.length === 1 &&
          summary?.relationships.filter(
            (r) => r.objectId === links[0].objectId && r.rule === "same-session-tool-id/v1",
          ).length === 1
            ? links[0]
            : null;
        const result = link
          ? (data.tools.events.find((e) => e.id === link.objectId) ?? null)
          : null;
        if (result) represented.add(result.id);
        return { call, result, linked: link?.objectId ?? null };
      });
  const standalone = data.tools.events.filter(
    (e) => e.payload.kind === "tool_result" && !represented.has(e.id),
  );
  return (
    <div className={`brief-layout ${inspector ? "inspecting-evidence" : ""}`}>
      <article className="session-document" aria-label="Session review">
        <section className="brief-section">
          <div className="brief-section-heading">
            <h2>Developer request</h2>
            <span>{data.prompts.total} recorded</span>
          </div>
          {!data.prompts.total ? (
            <p className="document-muted">
              No developer prompt is retained for this review. Repository observations do not
              reconstruct a missing request.
            </p>
          ) : (
            data.prompts.events.map((e) => (
              <div key={e.id} className="request-entry">
                <p>
                  {"content" in e.payload
                    ? (e.payload.content.text ?? `[Content ${e.payload.content.state}]`)
                    : "Prompt unavailable"}
                </p>
                <button className="source-action" type="button" onClick={() => onEvidence(e.id)}>
                  <Icon name="link" size={13} />
                  Recorded source
                </button>
              </div>
            ))
          )}
          {data.prompts.nextCursor !== null && data.prompts.events.length < 200 && (
            <button
              type="button"
              className="text-button"
              disabled={Boolean(busy)}
              onClick={() => void more("prompts")}
            >
              Load more requests
            </button>
          )}
          {data.prompts.events.length >= 200 && (
            <p className="document-muted">
              Request display limited to 200 observations. Use Activity to inspect the retained
              history.
            </p>
          )}
        </section>
        <section className="brief-section">
          <div className="brief-section-heading">
            <h2>Repository changes</h2>
            <button className="text-button" type="button" onClick={() => onView("File changes")}>
              Open changes
              <Icon name="arrow-right" size={14} />
            </button>
          </div>
          {data.captures.total ? (
            <>
              <div className="capture-summary">
                <Icon name="branch" size={20} />
                <div>
                  <strong>{data.captures.total} repository captures</strong>
                  <p>
                    {data.captures.total > 1
                      ? "Compare the recorded baseline and checkpoint versions."
                      : "One observed version. A before/after change cannot yet be established."}
                  </p>
                </div>
              </div>
              <p className="document-muted">
                {latest?.dirty === true
                  ? "The latest capture reports a dirty working tree."
                  : latest?.dirty === false
                    ? "The latest capture reports no raw-byte working-tree differences."
                    : "Working-tree dirty state is unknown."}{" "}
                Captures do not establish exclusive agent authorship.
              </p>
            </>
          ) : (
            <p className="document-muted">
              No repository snapshots are retained. File paths mentioned by tools alone do not prove
              a code change.
            </p>
          )}
        </section>
        <section className="brief-section">
          <div className="brief-section-heading">
            <h2>Recorded work</h2>
            <button className="text-button" type="button" onClick={() => onView("Timeline")}>
              All activity
              <Icon name="arrow-right" size={14} />
            </button>
          </div>
          <p className="section-context">
            Tool requests and results linked only by unambiguous recorded tool IDs. This is a
            derived reading view.
          </p>
          {!data.tools.total ? (
            <p className="document-muted">No tool observations are retained.</p>
          ) : (
            <div className="work-sequence">
              {toolRows.map(({ call, result, linked }) => (
                <div className="sequence-item" key={call.id}>
                  <span className="sequence-mark">
                    <Icon
                      name={
                        call.payload.kind === "tool_call" && call.payload.toolName === "Bash"
                          ? "terminal"
                          : "file"
                      }
                      size={15}
                    />
                  </span>
                  <div>
                    <div className="sequence-title">
                      <strong>{eventTitle(call)}</strong>
                      <button
                        className="source-action"
                        type="button"
                        onClick={() => onEvidence(call.id)}
                      >
                        Source
                        <Icon name="arrow" size={12} />
                      </button>
                    </div>
                    <pre>
                      {call.payload.kind === "tool_call"
                        ? (call.payload.path ??
                          call.payload.content.text ??
                          `[Content ${call.payload.content.state}]`)
                        : preview(call)}
                    </pre>
                    {linked ? (
                      <button
                        type="button"
                        className={`sequence-result ${result?.payload.kind === "tool_result" && result.payload.status === "failure" ? "warning" : ""}`}
                        onClick={() => onEvidence(linked)}
                      >
                        <Icon name="link" size={13} />
                        {result ? eventTitle(result) : "ID-linked result recorded"}
                        {result?.payload.kind === "tool_result" && result.payload.exitCode !== null
                          ? ` · exit ${result.payload.exitCode}`
                          : ""}
                        <Icon name="arrow-right" size={13} />
                      </button>
                    ) : (
                      <span className="sequence-unknown">
                        {summary
                          ? "No unambiguous result link established."
                          : "Result linkage unavailable."}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {standalone.map((e) => (
                <div key={e.id} className="sequence-item standalone">
                  <span className="sequence-mark">
                    <Icon name="activity" size={15} />
                  </span>
                  <div>
                    <strong>Separate result observation</strong>
                    <p>{eventTitle(e)}</p>
                    <button
                      className="source-action"
                      type="button"
                      onClick={() => onEvidence(e.id)}
                    >
                      Inspect source
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="sequence-pagination">
            <span>
              {data.tools.events.length} of {data.tools.total} tool observations loaded
            </span>
            {data.tools.nextCursor !== null && data.tools.events.length < 200 && (
              <button
                className="text-button"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void more("tools")}
              >
                {busy ? "Loading…" : "Load more work"}
              </button>
            )}
            {data.tools.events.length >= 200 && (
              <span>200-record display limit. Open All activity for the remaining records.</span>
            )}
          </div>
        </section>
        <section className="brief-section">
          <div className="brief-section-heading">
            <h2>Verification evidence</h2>
            <span>{verification ? verification.checks.length : "—"} recorded checks</span>
          </div>
          <p className="section-context">
            Recorded commands, results and parsed counts. A recorded check does not establish that
            the feature works.
          </p>
          {!verification ? (
            <p className="document-muted">
              Verification evidence is loading or unavailable. Use Refresh to retry the local
              summary.
            </p>
          ) : !verification.checks.length ? (
            <p className="document-muted">
              No command result is recorded for this session. That is not evidence that no testing
              happened.
            </p>
          ) : (
            <div className="check-list">
              {verification.checks.map((check) => (
                <article className="check-row" key={check.id}>
                  <div className="check-head">
                    <span className="check-command">
                      {check.command ?? "[Command content disabled]"}
                    </span>
                    <span className={`check-state ${check.state}`}>
                      {checkStateLabel[check.state]}
                    </span>
                  </div>
                  <div className="check-facts">
                    <span>Result {check.resultObserved ? "recorded" : "missing"}</span>
                    <span>Exit {check.exitCode ?? "—"}</span>
                    <span>Passed {check.counts.passed ?? "—"}</span>
                    <span>Failed {check.counts.failed ?? "—"}</span>
                  </div>
                  {check.files.length > 0 && (
                    <div className="check-files">
                      {check.files.map((file) => (
                        <span className="check-file" key={`${file.eventId}-${file.position}`}>
                          <Icon name="file" size={12} />
                          {file.path}
                          <span>
                            {file.position === "before" ? "referenced before" : "referenced after"}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="check-note">{check.uncertainty}</p>
                  <details className="check-rule">
                    <summary>Rule and supporting observations</summary>
                    <code>{check.rule}</code>
                    <p>Supporting observations: {check.evidenceIds.join(", ")}</p>
                  </details>
                  <button
                    className="source-action"
                    type="button"
                    onClick={() => onEvidence(check.id)}
                  >
                    <Icon name="link" size={13} />
                    {check.resultObserved ? "Recorded result" : "Recorded command"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="brief-section">
          <div className="brief-section-heading">
            <h2>Source reconciliation</h2>
            <span>{reconciliation ? reconciliation.tools.length : "—"} joined tools</span>
          </div>
          <p className="section-context">
            Hook and telemetry observations are kept separate. They are joined only by explicit
            identifiers.
          </p>
          <details className="reconciliation-disclosure">
            <summary>Inspect joined sources and reported totals</summary>
            <ReconciliationPanel view={reconciliation} />
          </details>
        </section>
        <section className="brief-section">
          <div className="brief-section-heading">
            <h2>Unresolved evidence</h2>
            <button className="text-button" type="button" onClick={onGaps}>
              Inspect gaps
              <Icon name="arrow-right" size={14} />
            </button>
          </div>
          {data.gaps.total ? (
            <>
              <p className="section-context">
                {data.gaps.total} recorded capture {data.gaps.total === 1 ? "gap" : "gaps"}. These
                describe retained evidence, not a verdict on the feature.
              </p>
              {data.gaps.events.map((e) => (
                <button
                  className="document-gap"
                  type="button"
                  key={e.id}
                  onClick={() => onEvidence(e.id)}
                >
                  <Icon name="alert" size={16} />
                  <span>
                    <strong>{eventTitle(e)}</strong>
                    <span>{preview(e)}</span>
                  </span>
                  <Icon name="arrow" size={13} />
                </button>
              ))}
              {data.gaps.nextCursor !== null && (
                <button type="button" className="text-button" onClick={onGaps}>
                  See remaining recorded gaps
                </button>
              )}
            </>
          ) : (
            <p className="document-muted">
              No gap observations are retained. Absence of a gap event does not establish complete
              capture.
            </p>
          )}
        </section>
      </article>
      {inspector ? (
        <aside className="desktop-inspector session-evidence" aria-label="Evidence inspector">
          <div className="inspector-label">
            <Icon name="file" size={16} />
            Evidence inspector
            <button
              type="button"
              className="icon-button"
              aria-label="Close evidence inspector"
              onClick={onDismiss}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          {inspector}
        </aside>
      ) : (
        <aside className="session-properties" aria-label="Session properties">
          <h2>Properties</h2>
          <dl>
            <dt>Source</dt>
            <dd>{project.synthetic ? "Synthetic example" : "Local repository"}</dd>
            <dt>Capture state</dt>
            <dd>
              <span className={`work-capture ${session.ended ? "" : "warning"}`}>
                <i />
                {session.ended ? "End recorded" : "No end recorded"}
              </span>
            </dd>
            <dt>Repository</dt>
            <dd>{project.name}</dd>
            <dt>Source date · UTC</dt>
            <dd>{sourceDate(session.startedAt)}</dd>
            <dt>Session</dt>
            <dd>
              <code>{session.id}</code>
            </dd>
            <dt>Observations</dt>
            <dd>{session.count}</dd>
            <dt>Code capture</dt>
            <dd>{project.policy.code ? "Enabled" : "Disabled"}</dd>
          </dl>
          <h3>Reported tokens</h3>
          <dl className="property-usage">
            <dt>Input</dt>
            <dd>{number(summary?.usage.input ?? null)}</dd>
            <dt>Output</dt>
            <dd>{number(summary?.usage.output ?? null)}</dd>
            <dt>Cache read</dt>
            <dd>{number(summary?.usage.cacheRead ?? null)}</dd>
            <dt>Cache write</dt>
            <dd>{number(summary?.usage.cacheWrite ?? null)}</dd>
          </dl>
          <button className="text-button" type="button" onClick={() => onView("Reported usage")}>
            Inspect usage
            <Icon name="arrow-right" size={13} />
          </button>
          <p className="property-note">
            Unknown values stay —. A reported command result does not establish feature correctness.
          </p>
          <button className="text-button" type="button" onClick={() => onView("Capture coverage")}>
            Capture details
            <Icon name="arrow-right" size={13} />
          </button>
        </aside>
      )}
    </div>
  );
}
