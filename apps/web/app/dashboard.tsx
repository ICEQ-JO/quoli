"use client";

import type {
  EventPage,
  EventQuery,
  Project,
  Relationship,
  Session,
  StoredEvent,
  UsageView,
} from "@traceframe/schema";
import { clock, number } from "@traceframe/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChangesView } from "./components/changes-view";
import { EvidenceInspector } from "./components/evidence-inspector";
import { CoveragePanel, UsagePanel } from "./components/session-views";
import { Icon } from "./components/ui-icon";
import { WorkspaceHome } from "./components/workspace-home";
import {
  eventIcon,
  eventTitle,
  eventTone,
  initialLocation,
  preview,
  type ReviewLocation,
  readLocation,
  reviewUrl,
  type View,
} from "./review";

type Summary = {
  usage: UsageView;
  relationships: Relationship[];
  kindCounts: Record<string, number>;
};
const views: View[] = ["Timeline", "File changes", "Reported usage", "Capture coverage"];
const filters: { key: EventQuery["kind"]; label: string }[] = [
  { key: "all", label: "All activity" },
  { key: "commands", label: "Commands" },
  { key: "files", label: "Files" },
  { key: "prompt", label: "Prompts" },
  { key: "gap", label: "Gaps" },
  { key: "usage", label: "Usage" },
];
async function read<T>(params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/data?${new URLSearchParams(params)}`, {
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not load local evidence.");
  return data;
}
async function readPage(
  project: string,
  session: string,
  query: EventQuery,
  signal?: AbortSignal,
): Promise<EventPage> {
  // Search text stays in a bounded POST body, never in the URL or access-log path.
  const response = await fetch("/api/data", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, session, query }),
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not search this session.");
  return data;
}
export default function Dashboard() {
  const [location, setLocation] = useState<ReviewLocation>(initialLocation),
    [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]),
    [sessions, setSessions] = useState<Session[]>([]),
    [summary, setSummary] = useState<Summary | null>(null);
  const [page, setPage] = useState<EventPage>({ events: [], nextCursor: null, total: 0 }),
    [selected, setSelected] = useState<StoredEvent | null>(null);
  const [search, setSearch] = useState(""),
    [debouncedSearch, setDebouncedSearch] = useState(""),
    [kind, setKind] = useState<EventQuery["kind"]>("all"),
    [order, setOrder] = useState<EventQuery["order"]>("receipt");
  const [loading, setLoading] = useState(true),
    [loadingMore, setLoadingMore] = useState(false),
    [inspecting, setInspecting] = useState(false),
    [error, setError] = useState(""),
    [online, setOnline] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [metadataFailed, setMetadataFailed] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(""),
    [copyErrorId, setCopyErrorId] = useState("");
  const pageEpoch = useRef(0),
    dialog = useRef<HTMLDialogElement>(null),
    searchInput = useRef<HTMLInputElement>(null),
    rowRefs = useRef(new Map<string, HTMLButtonElement>()),
    copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { project, session, view, event: eventId } = location;
  const isWorkspace = view === "Overview" || view === "Sessions";
  useEffect(() => {
    setLocation(readLocation(new URL(window.location.href)));
    setReady(true);
    const pop = () => {
      setLocation(readLocation(new URL(window.location.href)));
      setSearch("");
      setKind("all");
    };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1099px)");
    const changed = () => {
      if (!media.matches) dialog.current?.close();
    };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (eventId && view === "Timeline" && window.matchMedia("(max-width: 1099px)").matches) {
      if (!dialog.current?.open) dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [ready, eventId, view]);
  const navigate = useCallback((next: ReviewLocation) => {
    window.history.pushState(null, "", reviewUrl(next));
    setLocation(next);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 180);
    return () => clearTimeout(timer);
  }, [search]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is the explicit user-requested reload trigger.
  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    setSummary(null);
    setMetadataLoading(true);
    setMetadataFailed(false);
    Promise.all([
      read<Project[]>({ resource: "projects" }, abort.signal),
      read<Session[]>({ resource: "sessions", project }, abort.signal),
    ])
      .then(([p, s]) => {
        setProjects(p);
        setSessions(s);
        setOnline(true);
        if (!isWorkspace && s.some((item) => item.id === session)) {
          read<Summary>({ resource: "summary", project, session }, abort.signal)
            .then(setSummary)
            .catch((e) => {
              if (!abort.signal.aborted) setError(e.message);
            });
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setMetadataFailed(true);
          setError(e.message);
          setOnline(false);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setMetadataLoading(false);
      });
    return () => abort.abort();
  }, [ready, project, session, refresh, isWorkspace]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is the explicit user-requested reload trigger.
  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    const epoch = ++pageEpoch.current;
    if (isWorkspace) {
      setLoading(false);
      setError("");
      return () => abort.abort();
    }
    setPage({ events: [], nextCursor: null, total: 0 });
    setLoading(true);
    setLoadingMore(false);
    setError("");
    readPage(project, session, { search: debouncedSearch, kind, order, cursor: 0 }, abort.signal)
      .then((result) => {
        if (epoch === pageEpoch.current) {
          setPage(result);
          setOnline(true);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setError(e.message);
          setOnline(false);
        }
      })
      .finally(() => {
        if (epoch === pageEpoch.current) setLoading(false);
      });
    return () => abort.abort();
  }, [ready, project, session, debouncedSearch, kind, order, refresh, isWorkspace]);
  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    if (!eventId) {
      setSelected(
        page.events.find(
          (e) => e.projectId === project && e.sessionId === session && e.payload.kind === "prompt",
        ) ??
          page.events.find((e) => e.projectId === project && e.sessionId === session) ??
          null,
      );
      setInspecting(false);
      return;
    }
    const known = page.events.find(
      (e) => e.id === eventId && e.projectId === project && e.sessionId === session,
    );
    if (known) {
      setSelected(known);
      setInspecting(false);
      return;
    }
    setInspecting(true);
    setSelected(null);
    read<EventPage>({ resource: "evidence", project, session, event: eventId }, abort.signal)
      .then((result) => setSelected(result.events[0] ?? null))
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setInspecting(false);
      });
    return () => abort.abort();
  }, [ready, project, session, eventId, page.events]);
  function dismissEvidence() {
    dialog.current?.close();
    if (eventId) {
      const next = { ...location, event: "" };
      window.history.replaceState(null, "", reviewUrl(next));
      setLocation(next);
    }
  }
  function openEvidence(id: string) {
    navigate({ ...location, view: "Timeline", event: id });
    if (window.matchMedia("(max-width: 1099px)").matches && !dialog.current?.open)
      dialog.current?.showModal();
  }
  function chooseSession(id: string) {
    pageEpoch.current++;
    setRefresh((value) => value + 1);
    setSearch("");
    setDebouncedSearch("");
    setKind("all");
    setSelected(null);
    setPage({ events: [], nextCursor: null, total: 0 });
    setSummary(null);
    dialog.current?.close();
    navigate({
      ...location,
      session: id,
      event: "",
      before: "",
      after: "",
      file: "",
      view: "Timeline",
    });
  }
  async function more() {
    if (page.nextCursor === null || loadingMore) return;
    const epoch = pageEpoch.current;
    setLoadingMore(true);
    try {
      const result = await readPage(project, session, {
        search: debouncedSearch,
        kind,
        order,
        cursor: page.nextCursor,
      });
      if (epoch === pageEpoch.current)
        setPage((old) => ({
          ...result,
          events: [
            ...old.events,
            ...result.events.filter((e) => !old.events.some((v) => v.id === e.id)),
          ],
        }));
    } catch (e) {
      if (epoch === pageEpoch.current) setError((e as Error).message);
    } finally {
      if (epoch === pageEpoch.current) setLoadingMore(false);
    }
  }
  async function copyLink() {
    if (!selected) return;
    const next = { ...location, event: selected.id, view: "Timeline" as View };
    window.history.replaceState(null, "", reviewUrl(next));
    setLocation(next);
    try {
      await navigator.clipboard.writeText(new URL(reviewUrl(next), window.location.origin).href);
      setCopiedId(selected.id);
      setCopyErrorId("");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(""), 2500);
    } catch {
      setCopyErrorId(selected.id);
    }
  }
  function showGaps() {
    setSearch("");
    setDebouncedSearch("");
    setKind("gap");
    navigate({ ...location, view: "Timeline", event: "" });
  }
  const current = sessions.find((s) => s.id === session),
    projectName = projects.find((p) => p.id === project)?.name ?? "Local project";
  const currentProject = projects.find((p) => p.id === project);
  const synthetic = currentProject?.synthetic ?? true;
  const gaps = summary?.kindCounts.gap ?? 0;
  const links =
    summary?.relationships.filter(
      (r) => r.subjectId === selected?.id || r.objectId === selected?.id,
    ) ?? [];
  const inspector = (
    <EvidenceInspector
      event={selected}
      links={links}
      loading={inspecting}
      copied={Boolean(selected && copiedId === selected.id)}
      copyError={Boolean(selected && copyErrorId === selected.id)}
      onCopy={() => void copyLink()}
      onFollow={openEvidence}
    />
  );
  const count = current?.count ?? 0;
  const tabs = (target: View) => navigate({ ...location, view: target });
  return (
    <div className="review-app">
      <a className="skip-link" href="#session-content">
        Skip to session
      </a>
      <aside className="app-sidebar">
        <a className="app-brand" href="/" aria-label="Traceframe home">
          <span>
            <Icon name="brand" size={25} />
          </span>
          Traceframe<span className="preview-label">Preview</span>
        </a>
        <div className="workspace-project">
          <Icon name="box" />
          <div>
            <span>Local project</span>
            {projects.length > 1 ? (
              <select
                aria-label="Project"
                value={project}
                onChange={(e) => navigate({ ...initialLocation, project: e.target.value })}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{projectName}</strong>
            )}
          </div>
        </div>
        <nav className="primary-nav" aria-label="Workspace">
          <button
            type="button"
            aria-current={view === "Overview" ? "page" : undefined}
            onClick={() => navigate({ ...location, view: "Overview", event: "" })}
          >
            <Icon name="overview" />
            Overview
          </button>
          <button
            type="button"
            aria-current={view !== "Overview" ? "page" : undefined}
            onClick={() => navigate({ ...location, view: "Sessions", event: "" })}
          >
            <Icon name="sessions" />
            Sessions<span>{sessions.length}</span>
          </button>
        </nav>
        <div className="sidebar-heading">
          <h2>Recent sessions</h2>
        </div>
        <nav aria-label="Sessions" className="session-nav">
          {sessions.map((s) => (
            <button
              type="button"
              key={s.id}
              aria-current={!isWorkspace && s.id === session ? "page" : undefined}
              onClick={() => chooseSession(s.id)}
            >
              <span className={`session-marker ${s.ended ? "" : "warning"}`}>
                <Icon name="session" size={16} />
              </span>
              <span className="session-nav-copy">
                <strong>{s.title}</strong>
                <small>{s.count} observations</small>
              </span>
            </button>
          ))}
          {!sessions.length && <p className="sidebar-placeholder">No sessions retained.</p>}
        </nav>
        <div className="sidebar-help">
          <Icon name="info" />
          <div>
            <strong>{synthetic ? "Explore the preview" : "Local repository"}</strong>
            <p>
              {synthetic
                ? "Three authored sessions to explore. No live agent connected."
                : "Repository observations stay local. No live agent connected."}
            </p>
          </div>
        </div>
        <div className="sidebar-footer">
          <Icon name="lock" size={15} />
          <span>Evidence stays on this machine.</span>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="workspace-toolbar">
          <div className="breadcrumb">
            <Icon name="box" size={17} />
            <span>{projectName}</span>
            <Icon name="arrow" size={13} />
            <strong>
              {view === "Overview"
                ? "Overview"
                : view === "Sessions"
                  ? "Sessions"
                  : "Session review"}
            </strong>
          </div>
          <div className="toolbar-right">
            <span className={`collector-state ${online ? "online" : ""}`}>
              <i />
              {online ? "Collector connected" : "Connecting…"}
            </span>
            <button
              className="button subtle"
              type="button"
              disabled={loading}
              onClick={() => setRefresh((v) => v + 1)}
            >
              <Icon name="refresh" size={16} />
              <span>Refresh</span>
            </button>
          </div>
        </header>
        <main
          id="session-content"
          tabIndex={-1}
          className={isWorkspace ? "workspace-home" : "review-workbench"}
        >
          {isWorkspace ? (
            <>
              {error && (
                <div className="error-notice" role="alert">
                  <Icon name="alert" />
                  <div>
                    <strong>Couldn’t load local evidence</strong>
                    <p>{error}</p>
                  </div>
                  <button type="button" className="button" onClick={() => setRefresh((v) => v + 1)}>
                    Retry
                  </button>
                </div>
              )}
              <WorkspaceHome
                view={view}
                sessions={sessions}
                project={project}
                projectName={projectName}
                synthetic={synthetic}
                refresh={refresh}
                loading={metadataLoading}
                unavailable={metadataFailed}
                onSession={chooseSession}
                onLibrary={() => navigate({ ...location, view: "Sessions", event: "" })}
                onGaps={(id) => {
                  chooseSession(id);
                  setKind("gap");
                }}
              />
            </>
          ) : (
            <>
              <button
                type="button"
                className="back-to-sessions"
                onClick={() => navigate({ ...location, view: "Sessions", event: "" })}
              >
                <Icon name="arrow-left" size={15} />
                All sessions
              </button>
              <div className="mobile-session-picker">
                <label htmlFor="mobile-session">Session</label>
                <select
                  id="mobile-session"
                  value={session}
                  onChange={(e) => chooseSession(e.target.value)}
                >
                  {sessions.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="session-header">
                <div className="session-heading">
                  <h1>
                    {current?.title ?? (loading ? "Loading session…" : "Session unavailable")}
                  </h1>
                  <div className="session-status-row">
                    <span className="demo-label">
                      {synthetic ? "Synthetic session" : "Local repository"}
                    </span>
                    <span className={`session-state ${current?.ended ? "" : "warning"}`}>
                      <i />
                      {current?.ended ? "End recorded" : "Incomplete capture"}
                    </span>
                  </div>
                </div>
                <button
                  className="button review-action"
                  type="button"
                  onClick={showGaps}
                  disabled={!summary || !gaps}
                >
                  <Icon name="alert" size={17} />
                  Review gaps<span>{gaps}</span>
                </button>
              </div>
              <div className="session-facts">
                <span>
                  <Icon name="activity" size={15} />
                  <strong>{number(count)}</strong> observations
                </span>
                <span>
                  <Icon name="terminal" size={15} />
                  <strong>{number(summary?.kindCounts.tool_call ?? null)}</strong> tool requests
                </span>
                <span className="fact-id">
                  <code>{session}</code>
                </span>
                <details className="demo-help">
                  <summary>
                    <Icon name="info" size={15} />
                    {synthetic ? "About this demo" : "About this capture"}
                  </summary>
                  <div>
                    {synthetic
                      ? "These sessions are authored fixtures. No coding agent is connected."
                      : "These are local repository observations. No coding agent is connected."}{" "}
                    Recorded commands are never executed. Referenced file paths alone do not prove a
                    change or its author.
                  </div>
                </details>
              </div>
              {error && (
                <div className="error-notice" role="alert">
                  <Icon name="alert" />
                  <div>
                    <strong>Couldn’t load local evidence</strong>
                    <p>{error} Your stored observations have not been changed.</p>
                  </div>
                  <button type="button" className="button" onClick={() => setRefresh((v) => v + 1)}>
                    Retry
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setSearch("");
                      setKind("all");
                      navigate(initialLocation);
                    }}
                  >
                    Open demo session
                  </button>
                </div>
              )}
              <div className="session-tabs" role="tablist" aria-label="Session views">
                {views.map((v, i) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    id={`review-tab-${i}`}
                    tabIndex={view === v ? 0 : -1}
                    aria-selected={view === v}
                    aria-controls={`review-panel-${i}`}
                    onClick={() => tabs(v)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                        e.preventDefault();
                        const next =
                          (i + (e.key === "ArrowRight" ? 1 : views.length - 1)) % views.length;
                        tabs(views[next]);
                        document.getElementById(`review-tab-${next}`)?.focus();
                      }
                    }}
                  >
                    {v === "Timeline"
                      ? "Activity"
                      : v === "File changes"
                        ? "Changes"
                        : v === "Reported usage"
                          ? "Usage"
                          : "Coverage"}
                    {v === "Timeline" && <span>{count}</span>}
                  </button>
                ))}
              </div>
              <div
                className="session-view"
                role="tabpanel"
                id={`review-panel-${views.indexOf(view)}`}
                aria-labelledby={`review-tab-${views.indexOf(view)}`}
              >
                {view === "Timeline" && (
                  <div className="activity-layout">
                    <section className="activity-panel" aria-label="Session activity">
                      <div className="activity-controls">
                        <div className="search-field">
                          <Icon name="search" size={18} />
                          <input
                            ref={searchInput}
                            aria-label="Search entire session"
                            placeholder="Search this session…"
                            maxLength={200}
                            value={search}
                            onChange={(e) => {
                              setSearch(e.target.value);
                              if (eventId) navigate({ ...location, event: "" });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setSearch("");
                            }}
                          />
                          {search && (
                            <button
                              type="button"
                              className="icon-button"
                              aria-label="Clear search"
                              onClick={() => {
                                setSearch("");
                                searchInput.current?.focus();
                              }}
                            >
                              <Icon name="close" size={15} />
                            </button>
                          )}
                        </div>
                        <label className="sort-control">
                          <span className="sr-only">Activity order</span>
                          <select
                            aria-label="Activity order"
                            value={order}
                            onChange={(e) => setOrder(e.target.value as EventQuery["order"])}
                          >
                            <option value="receipt">Receipt order</option>
                            <option value="source">Source time</option>
                          </select>
                        </label>
                      </div>
                      <fieldset className="activity-filters">
                        <legend className="sr-only">Filter observations</legend>
                        {filters.map((f) => (
                          <button
                            type="button"
                            key={f.key}
                            aria-pressed={kind === f.key}
                            onClick={() => {
                              setKind(f.key);
                              if (eventId) navigate({ ...location, event: "" });
                            }}
                          >
                            {f.label}
                            {f.key === "gap" && gaps > 0 && <span>{gaps}</span>}
                          </button>
                        ))}
                      </fieldset>
                      <div className="activity-list-heading">
                        <span>
                          {loading
                            ? "Searching session…"
                            : search || kind !== "all"
                              ? `${page.total} matching observations`
                              : "Recorded activity"}
                        </span>
                        <span>Source time · UTC</span>
                      </div>
                      <section
                        className="activity-list"
                        aria-busy={loading}
                        aria-label="Activity observations"
                      >
                        {loading ? (
                          <div
                            className="activity-skeleton"
                            role="status"
                            aria-label="Loading activity"
                          >
                            {[0, 1, 2, 3].map((i) => (
                              <div key={i}>
                                <span />
                                <div>
                                  <i />
                                  <i />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : page.events.length ? (
                          page.events.map((e, index) => (
                            <button
                              type="button"
                              key={e.id}
                              ref={(node) => {
                                if (node) rowRefs.current.set(e.id, node);
                                else rowRefs.current.delete(e.id);
                              }}
                              className={`event-row ${selected?.id === e.id ? "selected" : ""} ${eventTone(e)}`}
                              aria-pressed={selected?.id === e.id}
                              onClick={() => openEvidence(e.id)}
                              onKeyDown={(key) => {
                                if (key.key === "ArrowDown" || key.key === "ArrowUp") {
                                  key.preventDefault();
                                  const next =
                                    page.events[index + (key.key === "ArrowDown" ? 1 : -1)];
                                  if (next) {
                                    rowRefs.current.get(next.id)?.focus();
                                    if (window.matchMedia("(min-width: 1100px)").matches)
                                      navigate({ ...location, event: next.id });
                                  }
                                }
                              }}
                            >
                              <span className={`event-symbol ${e.payload.kind}`}>
                                <Icon name={eventIcon(e)} size={17} />
                              </span>
                              <span className="event-copy">
                                <span className="event-title">
                                  {eventTitle(e)}
                                  {e.payload.kind === "tool_result" &&
                                    e.payload.exitCode !== null && (
                                      <span className={`exit-code ${eventTone(e)}`}>
                                        exit {e.payload.exitCode}
                                      </span>
                                    )}
                                </span>
                                <span className="event-preview">{preview(e)}</span>
                                {e.payload.kind === "tool_call" && e.payload.path && (
                                  <span className="referenced-path">
                                    <Icon name="file" size={12} />
                                    {e.payload.path}
                                    <span>referenced</span>
                                  </span>
                                )}
                              </span>
                              <span className="event-time">
                                <time>{clock(e.sourceTime)}</time>
                                <span>#{e.sequence}</span>
                              </span>
                              <Icon name="arrow" size={13} />
                            </button>
                          ))
                        ) : (
                          <div className="activity-empty">
                            <Icon name="search" size={26} />
                            <h2>No matching observations</h2>
                            <p>
                              {search || kind !== "all"
                                ? "Try another search or show all activity. The entire retained session was searched."
                                : "No observations are retained for this session."}
                            </p>
                            <button
                              type="button"
                              className="button"
                              onClick={() => {
                                setSearch("");
                                setKind("all");
                              }}
                            >
                              Clear filters
                            </button>
                          </div>
                        )}
                      </section>
                      <div className="activity-pagination">
                        <span aria-live="polite">
                          {loading
                            ? "Loading…"
                            : `${page.events.length} of ${page.total} observations`}
                        </span>
                        {page.nextCursor !== null && !loading ? (
                          <button
                            type="button"
                            className="button"
                            disabled={loadingMore}
                            onClick={() => void more()}
                          >
                            {loadingMore ? "Loading…" : "Load more"}
                            <Icon name="arrow-down" size={14} />
                          </button>
                        ) : (
                          !loading && <span>End of retained history</span>
                        )}
                      </div>
                    </section>
                    <aside className="desktop-inspector" aria-label="Evidence inspector">
                      <div className="inspector-label">
                        <Icon name="file" size={16} />
                        Evidence inspector
                      </div>
                      {inspector}
                    </aside>
                  </div>
                )}
                {view === "File changes" && (
                  <ChangesView
                    project={project}
                    session={session}
                    refresh={refresh}
                    selection={{
                      before: location.before,
                      after: location.after,
                      file: location.file,
                    }}
                    onSelection={(next, replace = false) => {
                      const target = {
                        ...location,
                        ...next,
                        event: "",
                        view: "File changes" as View,
                      };
                      if (replace) {
                        window.history.replaceState(null, "", reviewUrl(target));
                        setLocation(target);
                      } else navigate(target);
                    }}
                    onEvidence={openEvidence}
                  />
                )}
                {view === "Reported usage" &&
                  (summary ? (
                    <UsagePanel usage={summary.usage} onEvidence={openEvidence} />
                  ) : (
                    <div className="view-loading" role="status">
                      Loading reported usage…
                    </div>
                  ))}
                {view === "Capture coverage" && (
                  <CoveragePanel
                    session={current}
                    project={currentProject}
                    snapshotCount={summary?.kindCounts.repository_snapshot ?? 0}
                  />
                )}
              </div>
            </>
          )}
          <footer className="workspace-footnote">
            <span>
              <Icon name="lock" size={13} />
              Local storage · no session uploads
            </span>
            <span>Reported activity is evidence, not proof of correctness.</span>
          </footer>
        </main>
      </div>
      <dialog
        className="mobile-inspector"
        ref={dialog}
        aria-label="Evidence details"
        onCancel={(e) => {
          e.preventDefault();
          dismissEvidence();
        }}
      >
        <div className="mobile-inspector-toolbar">
          <strong>Evidence details</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Close evidence details"
            onClick={dismissEvidence}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="mobile-inspector-content">{inspector}</div>
      </dialog>
    </div>
  );
}
