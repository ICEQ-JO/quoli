"use client";

import type {
  EventPage,
  Project,
  Relationship,
  Session,
  StoredEvent,
  UsageView,
} from "@traceframe/schema";
import { clock, kindLabels, number } from "@traceframe/ui";
import { useCallback, useEffect, useRef, useState } from "react";

type Summary = {
  usage: UsageView;
  relationships: Relationship[];
  kindCounts: Record<string, number>;
};
type Tab = "Timeline" | "Reported usage" | "Capture coverage";
async function read<T>(params: Record<string, string>): Promise<T> {
  const res = await fetch(`/api/data?${new URLSearchParams(params)}`, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Could not load evidence.");
  return body as T;
}
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    trace: (
      <>
        <path d="M4 4h6v6H4zM14 14h6v6h-6zM14 4h6M17 1v6M4 17h6M7 14v6" />
      </>
    ),
    activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    box: (
      <>
        <path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9" />
      </>
    ),
    arrow: <path d="m8 5 7 7-7 7" />,
    terminal: (
      <>
        <path d="m4 6 5 5-5 5M12 18h8" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    alert: (
      <>
        <path d="m12 3 10 18H2zM12 9v5" />
        <path d="M12 17h.01" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H5v20h14V7zM14 2v5h5M8 12h8M8 16h6" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V6a4 4 0 0 1 8 0v4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.activity}
    </svg>
  );
}
function eventTitle(e: StoredEvent) {
  const p = e.payload;
  if (p.kind === "tool_call") return p.toolName === "Bash" ? "Run command" : `${p.toolName} file`;
  if (p.kind === "tool_result")
    return `${p.toolName} · ${p.status === "success" ? "success reported" : p.status === "failure" ? "failure reported" : p.status}`;
  if (p.kind === "gap") return p.reason.replaceAll("_", " ");
  return kindLabels[p.kind];
}
function preview(e: StoredEvent) {
  const p = e.payload;
  if ("content" in p) return p.content.text?.split("\n")[0] ?? `Content ${p.content.state}`;
  if (p.kind === "usage")
    return `${number(p.input)} input · ${number(p.output)} output · ${number(p.cacheRead)} cache read`;
  if (p.kind === "session_end")
    return `Source reports ${p.reason}. Capture may still be incomplete.`;
  return "An observation is missing or was not captured.";
}
export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState("demo-quoli");
  const [sessions, setSessions] = useState<Session[]>([]),
    [session, setSession] = useState("session-cache");
  const [events, setEvents] = useState<StoredEvent[]>([]),
    [summary, setSummary] = useState<Summary | null>(null);
  const [cursor, setCursor] = useState<number | null>(null),
    [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<StoredEvent | null>(null),
    [tab, setTab] = useState<Tab>("Timeline");
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [online, setOnline] = useState(false);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [sourceOrder, setSourceOrder] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true);
    setError("");
    try {
      const [p, s, page, view] = await Promise.all([
        read<Project[]>({ resource: "projects" }),
        read<Session[]>({ resource: "sessions", project }),
        read<EventPage>({ resource: "events", project, session }),
        read<Summary>({ resource: "summary", project, session }),
      ]);
      if (version !== request.current) return;
      setProjects(p);
      setSessions(s);
      setEvents(page.events);
      setCursor(page.nextCursor);
      setTotal(page.total);
      setSummary(view);
      setSelected(page.events.find((e) => e.payload.kind === "prompt") ?? page.events[0] ?? null);
      setOnline(true);
    } catch (e) {
      if (version === request.current) {
        setError(e instanceof Error ? e.message : "Could not load local evidence.");
        setOnline(false);
      }
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, [project, session]);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  async function more() {
    if (cursor === null) return;
    const version = request.current;
    try {
      const page = await read<EventPage>({
        resource: "events",
        project,
        session,
        cursor: String(cursor),
      });
      if (version !== request.current) return;
      setEvents((old) => [...old, ...page.events.filter((e) => !old.some((v) => v.id === e.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function evidence(id: string) {
    const version = request.current;
    try {
      const page = await read<EventPage>({ resource: "evidence", project, session, event: id });
      if (version === request.current) setSelected(page.events[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const current = sessions.find((s) => s.id === session);
  const visible = events.filter(
    (e) =>
      (filter === "all" ||
        (filter === "tools" ? e.payload.kind.startsWith("tool_") : e.payload.kind === filter)) &&
      `${eventTitle(e)} ${preview(e)}`.toLowerCase().includes(search.toLowerCase()),
  );
  if (sourceOrder)
    visible.sort(
      (a, b) => (a.sourceTime ?? "").localeCompare(b.sourceTime ?? "") || a.sequence - b.sequence,
    );
  const related =
    summary?.relationships.filter(
      (r) => r.subjectId === selected?.id || r.objectId === selected?.id,
    ) ?? [];
  const usage = summary?.usage;
  const changeSession = (id: string) => {
    setSession(id);
    setSearch("");
    setFilter("all");
    setTab("Timeline");
    setEvents([]);
    setSelected(null);
    setSummary(null);
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" className="wordmark">
          <span className="brand-icon">
            <Icon name="trace" size={23} />
          </span>
          traceframe<span className="alpha">α</span>
        </a>
        <div className="workspace-label">LOCAL WORKSPACE</div>
        <label className="project-picker">
          <Icon name="box" />
          <select
            aria-label="Project"
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              changeSession("session-cache");
            }}
          >
            {projects.length ? (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            ) : (
              <option value="demo-quoli">quoli</option>
            )}
          </select>
          <span className="tiny-tag">DEMO</span>
        </label>
        <div className="nav-active">
          <Icon name="activity" />
          Session explorer<span>{sessions.length || "—"}</span>
        </div>
        <div className="section-label">
          SESSIONS <span>synthetic fixtures</span>
        </div>
        <nav aria-label="Sessions" className="sessions">
          {sessions.map((s) => (
            <button
              type="button"
              key={s.id}
              aria-current={s.id === session ? "page" : undefined}
              className={`session-button ${s.id === session ? "active" : ""}`}
              onClick={() => changeSession(s.id)}
            >
              <span className={`status-dot ${s.ended ? "" : "amber"}`} />
              <span>
                <strong>{s.title}</strong>
                <small>
                  {s.count} observations · {s.ended ? "end recorded" : "incomplete"}
                </small>
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <Icon name="lock" />
            <div>
              <strong>Your machine. Your evidence.</strong>
              <p>Stored locally. No session uploads.</p>
            </div>
          </div>
          <div className="version">
            TRACEFRAME <span>0.1 / PREVIEW</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>{project === "demo-quoli" ? "quoli" : project}</strong>
            <span>/</span>Sessions
          </div>
          <div className="connection">
            <span className={`status-dot ${online ? "" : "amber"}`} />
            {online ? "Collector connected" : "Connecting to collector"}
            <span className="loopback">LOOPBACK</span>
          </div>
        </header>
        <main>
          <div className="heading-row">
            <div>
              <div className="eyebrow">
                SESSION EXPLORER <span> / 001</span>
              </div>
              <h1>
                The evidence behind
                <br className="mobile-break" /> the change<span>.</span>
              </h1>
              <p className="subtitle">
                What the agent reported. What we captured. What is still unknown.
              </p>
            </div>
            <button
              type="button"
              className="refresh"
              onClick={() => void load()}
              disabled={loading}
            >
              <Icon name="refresh" />
              Refresh
            </button>
          </div>
          <div className="demo-notice">
            <span className="demo-symbol">◈</span>
            <p>
              <strong>A safe place to explore.</strong> These sessions are entirely synthetic. No
              agent is connected and no recorded commands are executed.
            </p>
            <span className="tiny-tag">FIXTURE MODE</span>
          </div>
          {error && (
            <div role="alert" className="error-banner">
              <Icon name="alert" />
              <span>{error}</span>
              <button type="button" onClick={() => void load()}>
                Retry
              </button>
            </div>
          )}
          <section className="session-overview" aria-label="Selected session">
            <div className="session-heading">
              <div className="session-avatar">
                <Icon name="terminal" size={24} />
              </div>
              <div>
                <div className="overline">
                  {session} <span className="basis recorded">recorded</span>
                </div>
                <h2>{current?.title ?? (loading ? "Loading session…" : "No session loaded")}</h2>
              </div>
              <span className={`session-state ${current?.ended ? "" : "incomplete"}`}>
                <span className="status-dot" />
                {current?.ended ? "End recorded" : "Incomplete capture"}
              </span>
            </div>
            <div className="metrics">
              <Metric
                label="OBSERVATIONS"
                value={number(total)}
                detail="Append-only source records"
              />
              <Metric
                label="TOOL REQUESTS"
                value={number(summary?.kindCounts.tool_call ?? null)}
                detail="Requested ≠ completed"
              />
              <Metric
                label="REPORTED TOKENS"
                value={
                  usage?.input !== null && usage?.input !== undefined && usage.output !== null
                    ? number(usage.input + usage.output)
                    : "—"
                }
                detail="Non-cache input + output"
              />
              <Metric
                label="CAPTURE GAPS"
                value={number(summary?.kindCounts.gap ?? null)}
                detail="Explicitly visible uncertainty"
                warning
              />
            </div>
          </section>
          <div className="tabs" role="tablist" aria-label="Session views">
            {(["Timeline", "Reported usage", "Capture coverage"] as Tab[]).map((t) => (
              <button
                type="button"
                key={t}
                role="tab"
                aria-selected={tab === t}
                aria-controls="view-panel"
                id={`tab-${t.replaceAll(" ", "-")}`}
                onClick={() => setTab(t)}
              >
                {t}
                {t === "Timeline" && <span>{total}</span>}
              </button>
            ))}
            <span className="evidence-legend">
              <i />
              Evidence first. Assumptions visible.
            </span>
          </div>
          <div id="view-panel" role="tabpanel" aria-labelledby={`tab-${tab.replaceAll(" ", "-")}`}>
            {tab === "Timeline" && (
              <div className="explorer-grid">
                <section className="timeline-panel" aria-label="Session timeline">
                  <div className="timeline-toolbar">
                    <div className="search">
                      <Icon name="search" size={15} />
                      <input
                        aria-label="Search loaded observations"
                        placeholder="Search loaded observations…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Filter observations"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All events</option>
                      <option value="tools">Tool activity</option>
                      <option value="prompt">Prompts</option>
                      <option value="gap">Capture gaps</option>
                      <option value="usage">Usage</option>
                    </select>
                  </div>
                  <div className="order-row">
                    <span>
                      {sourceOrder ? "SOURCE TIME" : "RECEIPT ORDER"}{" "}
                      <span className="muted">· {visible.length} loaded matches</span>
                    </span>
                    <button type="button" onClick={() => setSourceOrder(!sourceOrder)}>
                      {sourceOrder ? "Use receipt order" : "Use source time"} ↓
                    </button>
                  </div>
                  <div className="event-list" aria-busy={loading}>
                    {loading ? (
                      <div className="empty-state">Reading local evidence…</div>
                    ) : !visible.length ? (
                      <div className="empty-state">
                        No matching loaded observations.
                        {cursor !== null && " Load more to search the rest."}
                      </div>
                    ) : (
                      visible.map((e) => (
                        <button
                          type="button"
                          key={e.id}
                          className={`event-row ${selected?.id === e.id ? "selected" : ""} ${e.payload.kind === "gap" ? "gap-row" : ""}`}
                          aria-pressed={selected?.id === e.id}
                          onClick={() => setSelected(e)}
                        >
                          <div className={`event-icon ${e.payload.kind}`}>
                            <Icon
                              name={
                                e.payload.kind === "prompt"
                                  ? "activity"
                                  : e.payload.kind === "gap"
                                    ? "alert"
                                    : e.payload.kind === "usage"
                                      ? "box"
                                      : e.payload.kind === "tool_result"
                                        ? e.payload.status === "failure"
                                          ? "alert"
                                          : "check"
                                        : e.payload.kind === "tool_call"
                                          ? "terminal"
                                          : "trace"
                              }
                              size={16}
                            />
                          </div>
                          <div className="event-body">
                            <div className="event-title">
                              {eventTitle(e)}
                              {e.payload.kind === "tool_result" && e.payload.exitCode !== null && (
                                <span
                                  className={
                                    e.payload.exitCode === 0 ? "exit-code" : "exit-code failed"
                                  }
                                >
                                  exit {e.payload.exitCode}
                                </span>
                              )}
                            </div>
                            <p>{preview(e)}</p>
                            {e.payload.kind === "tool_call" && e.payload.path && (
                              <span className="path">
                                <Icon name="file" size={11} />
                                {e.payload.path}
                                <span>referenced path</span>
                              </span>
                            )}
                          </div>
                          <div className="event-meta">
                            <time>{clock(e.sourceTime)}</time>
                            <span>#{e.sequence}</span>
                          </div>
                          <Icon name="arrow" size={12} />
                        </button>
                      ))
                    )}
                  </div>
                  <div className="list-footer">
                    <span>
                      {events.length} of {total} observations loaded
                    </span>
                    {cursor !== null ? (
                      <button type="button" onClick={() => void more()}>
                        Load more <span>↓</span>
                      </button>
                    ) : (
                      <span>End of retained history</span>
                    )}
                  </div>
                </section>
                <aside className="evidence-panel" aria-label="Evidence inspector">
                  <div className="inspector-heading">
                    <span>INSPECT EVIDENCE</span>
                    <span className="inspection-dot" />
                  </div>
                  {selected ? (
                    <>
                      <div className="inspector-title">
                        <span className="basis recorded">recorded</span>
                        <h3>{eventTitle(selected)}</h3>
                        <p>
                          A retained source observation, not an independent guarantee of its
                          contents.
                        </p>
                      </div>
                      <dl className="metadata">
                        <div>
                          <dt>Source</dt>
                          <dd>Synthetic fixture</dd>
                        </div>
                        <div>
                          <dt>Event</dt>
                          <dd>{selected.id}</dd>
                        </div>
                        <div>
                          <dt>Source locator</dt>
                          <dd>{selected.sourceLocator ?? "Not available"}</dd>
                        </div>
                        <div>
                          <dt>Adapter</dt>
                          <dd>{selected.adapterVersion}</dd>
                        </div>
                        <div>
                          <dt>Source time</dt>
                          <dd>{clock(selected.sourceTime)} UTC</dd>
                        </div>
                        <div>
                          <dt>Received</dt>
                          <dd>{clock(selected.receivedAt)} UTC</dd>
                        </div>
                        <div>
                          <dt>Tool ID</dt>
                          <dd>{selected.toolId ?? "Not available"}</dd>
                        </div>
                        <div>
                          <dt>Prompt ID</dt>
                          <dd>{selected.promptId ?? "Not available"}</dd>
                        </div>
                      </dl>
                      <div className="content-heading">
                        CAPTURED PAYLOAD{" "}
                        <span>
                          {"content" in selected.payload
                            ? selected.payload.content.state
                            : "metadata"}
                        </span>
                      </div>
                      <pre className="payload">
                        {"content" in selected.payload
                          ? (selected.payload.content.text ??
                            `[Content ${selected.payload.content.state}]`)
                          : JSON.stringify(selected.payload, null, 2)}
                      </pre>
                      {"content" in selected.payload && (
                        <div className="byte-note">
                          {selected.payload.content.originalBytes === null
                            ? "Original size unavailable"
                            : `${number(selected.payload.content.originalBytes)} original bytes`}{" "}
                          · policy v{selected.policyVersion}
                        </div>
                      )}
                      <div className="relationship-section">
                        <div className="content-heading">
                          EVIDENCE LINKS <span>{related.length}</span>
                        </div>
                        {related.length ? (
                          related.map((r) => (
                            <button
                              type="button"
                              key={r.id}
                              className="relationship"
                              onClick={() =>
                                void evidence(
                                  r.subjectId === selected.id ? r.objectId : r.subjectId,
                                )
                              }
                            >
                              <span className="basis derived">derived</span>
                              <strong>
                                {r.subjectId === selected.id
                                  ? "Open matching tool result"
                                  : "Open matching tool request"}{" "}
                                <span>↗</span>
                              </strong>
                              <code>{r.rule}</code>
                              <p>{r.uncertainty}</p>
                            </button>
                          ))
                        ) : (
                          <p className="no-link">
                            No explicit linked observation. Proximity alone does not establish a
                            relationship.
                          </p>
                        )}
                      </div>
                      <details className="raw-details">
                        <summary>Normalized record</summary>
                        <pre>{JSON.stringify(selected, null, 2)}</pre>
                      </details>
                    </>
                  ) : (
                    <div className="empty-state">
                      Select an observation to inspect its evidence.
                    </div>
                  )}
                  <div className="inspector-footnote">
                    <Icon name="lock" size={13} />
                    Captured text is data. Never instructions.
                  </div>
                </aside>
              </div>
            )}
            {tab === "Reported usage" && (
              <section className="usage-panel">
                <div className="panel-heading">
                  <div>
                    <span className="basis derived">derived</span>
                    <h2>Reported consumption</h2>
                    <p>
                      Deterministic sums of uniquely identified request observations. No prompt or
                      file cost allocation.
                    </p>
                  </div>
                  <code>{usage?.rule}</code>
                </div>
                <div className="usage-grid">
                  {(
                    [
                      ["Non-cache input", usage?.input],
                      ["Output", usage?.output],
                      ["Cache read", usage?.cacheRead],
                      ["Cache write", usage?.cacheWrite],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="usage-card">
                      <span>{label}</span>
                      <strong>{number(value ?? null)}</strong>
                      <small>{value === null ? "Not fully reported" : "reported tokens"}</small>
                    </div>
                  ))}
                </div>
                <div className="cache-share">
                  <div>
                    <strong>Cache-read token share</strong>
                    <p>cache read / (non-cache input + cache read + cache write)</p>
                  </div>
                  <strong>
                    {usage?.cacheReadShare !== null && usage?.cacheReadShare !== undefined
                      ? `${(usage.cacheReadShare * 100).toFixed(1)}%`
                      : "Unknown"}
                  </strong>
                </div>
                <div className="usage-note">
                  <Icon name="alert" />
                  <p>
                    {usage?.complete
                      ? "All four token fields are present in the retained request observations. This does not establish that every request was captured."
                      : "Some usage is missing, conflicting or cannot be reconciled. Unknown values are shown as —, never zero."}{" "}
                    Cache-read token share is not a request cache-hit rate.
                  </p>
                </div>
                <h3 className="usage-evidence-title">Source observations</h3>
                {usage?.evidenceIds.length ? (
                  usage.evidenceIds.map((id) => (
                    <button
                      type="button"
                      className="usage-source"
                      key={id}
                      onClick={() => {
                        setTab("Timeline");
                        void evidence(id);
                      }}
                    >
                      <span className="basis recorded">recorded</span>
                      <code>{id}</code>
                      <span>Inspect request usage ↗</span>
                    </button>
                  ))
                ) : (
                  <p className="no-link">No retained usage observations.</p>
                )}
              </section>
            )}
            {tab === "Capture coverage" && (
              <section className="coverage-panel">
                <span className="basis derived">derived</span>
                <h2>Known boundaries, in plain sight.</h2>
                <p>Absence of an event is not proof that an action did not happen.</p>
                <div className="coverage-grid">
                  <Coverage
                    title="Session boundaries"
                    state={current?.ended ? "End recorded" : "End unavailable"}
                    text="A session ending does not mean all of its tools or results were captured."
                  />
                  <Coverage
                    title="Command verification"
                    state="Feature correctness unknown"
                    text="A reported exit code describes a command result. It does not establish that a feature works."
                  />
                  <Coverage
                    title="File changes"
                    state="Snapshots not available yet"
                    text="Tool paths are references, not repository diffs or proof of who changed a file."
                  />
                  <Coverage
                    title="Agent integration"
                    state="Synthetic sources only"
                    text="No real agent is connected. Claude Code compatibility must be verified before live collection."
                  />
                  <Coverage
                    title="Content policy"
                    state="Synthetic content enabled"
                    text="Only authored demo fixtures are retained. New real projects will default to metadata-only capture."
                  />
                  <Coverage
                    title="Privacy boundary"
                    state="Local storage"
                    text="No session uploads. Redaction reduces risk but cannot guarantee removal of all secrets."
                  />
                </div>
              </section>
            )}
          </div>
          <footer className="main-footer">
            <span>
              <span className="status-dot" />
              LOCAL FIRST · EVIDENCE LED
            </span>
            <span>Reported activity ≠ proven correctness.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div className={`metric ${warning ? "warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Coverage({ title, state, text }: { title: string; state: string; text: string }) {
  return (
    <article>
      <h3>{title}</h3>
      <span>{state}</span>
      <p>{text}</p>
    </article>
  );
}
