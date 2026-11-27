import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionDetail, ToolCall } from "../../../shared/model.ts";
import { isTypingTarget, modalOpen, modKey, roveTarget } from "../a11y.ts";
import { api, useData, useLiveEvents } from "../api.ts";
import { Inspector } from "../components/Inspector.tsx";
import { LiveAnnouncer } from "../components/LiveAnnouncer.tsx";
import { Palette } from "../components/Palette.tsx";
import { SessionHeader } from "../components/SessionHeader.tsx";
import { Sidebar } from "../components/Sidebar.tsx";
import { Summary } from "../components/Summary.tsx";
import { Timeline } from "../components/Timeline.tsx";
import { ErrorState, Icon, Loading, projectName } from "../components/ui.tsx";
import { AgentsLens } from "../lenses/AgentsLens.tsx";
import { useAgentsView } from "../lenses/agents/view.ts";
import { GitLens } from "../lenses/GitLens.tsx";
import { InfraLens } from "../lenses/InfraLens.tsx";
import { MapLens } from "../lenses/MapLens.tsx";
import { useCodeGraph } from "../lenses/map/useGraph.ts";
import { ReviewLens } from "../lenses/ReviewLens.tsx";
import { Link, navigate, parseBoardQuery, paths, useLocation } from "../router.ts";
import type { Lens, LensContext, Selection, Touch } from "../state.ts";

const LENSES: { id: Lens; label: string; hint: string }[] = [
  { id: "summary", label: "Summary", hint: "What was asked, changed, run and spent" },
  { id: "review", label: "Review", hint: "What to read before you merge" },
  { id: "agents", label: "Agents", hint: "What the agent did" },
  { id: "map", label: "Code", hint: "Understand a feature and what the agent changed" },
  { id: "git", label: "Git", hint: "Which branch and commits" },
  { id: "infra", label: "Infra", hint: "Where it runs" },
];

const remember = (key: string, value?: string | null) => {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
  return null;
};

/** Lenses about one session: they need a session and are not offered without one. */
const sessionOnly = (l: Lens) => l === "summary" || l === "review";

const isLens = (v: string | null): v is Lens => LENSES.some((l) => l.id === v);

export function BoardPage({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string | null;
}) {
  const { search } = useLocation();
  const view = parseBoardQuery(search);
  const remembered = remember("quoli.lens");
  // Summary needs a session: it is that session's default, and not offered without one.
  const lens: Lens = sessionId
    ? (view.lens ?? "summary")
    : view.lens && !sessionOnly(view.lens)
      ? view.lens
      : isLens(remembered) && !sessionOnly(remembered)
        ? remembered
        : "map";
  const selection = view.selection;

  const [projects, refreshProjects, projectsError] = useData("projects", api.projects);
  const project = projects?.find((p) => p.id === projectId) ?? null;
  const root = project?.root ?? null;

  const [sessions, refreshSessions, sessionsError] = useData(`sessions:${projectId}`, () =>
    api.sessions(projectId),
  );
  const [session, refreshSession, sessionError] = useData(sessionId, () =>
    api.session(sessionId as string),
  );
  const [code, refreshCode] = useData(root && `code:${root}`, () => api.code(root as string));
  const [git, refreshGit, gitError] = useData(root && `git:${root}`, () => api.git(root as string));
  const [infra, refreshInfra, infraError] = useData(root && `infra:${root}`, () =>
    api.infra(root as string),
  );

  const [review, refreshReview, reviewError] = useData(sessionId && `review:${sessionId}`, () =>
    api.review(sessionId as string),
  );

  const [cursor, setCursor] = useState<number | null>(null);
  const [palette, setPalette] = useState(false);
  // The code graph is parsed on the server only once someone looks at the Map or searches.
  const [wantGraph, setWantGraph] = useState(false);
  useEffect(() => {
    if (lens === "map" || palette) setWantGraph(true);
  }, [lens, palette]);
  const codeGraph = useCodeGraph(projectId, wantGraph || lens === "map" || palette);
  const refreshGraph = useRef(codeGraph.retry);
  refreshGraph.current = codeGraph.retry;
  // The sessions list is open when you arrive at a project and folds away once a session is open.
  const [listOpen, setListOpen] = useState(!sessionId && lens !== "map");
  // biome-ignore lint/correctness/useExhaustiveDependencies: fold the list when a session opens
  useEffect(() => setListOpen(!sessionId && lens !== "map"), [Boolean(sessionId), lens === "map"]);
  // Details without a selection (lens overview lists) are opt-in; a selection always opens them.
  const agentsView = useAgentsView();
  const [details, setDetails] = useState(() => remember("quoli.details") === "open");
  const toggleDetails = () => {
    remember("quoli.details", details ? null : "open");
    setDetails(!details);
  };

  // Navigation helpers: the URL is the source of truth for session, lens and selection.
  const go = useCallback(
    (sid: string | null, l: Lens | null, s: Selection, replace = false) =>
      navigate(paths.board(projectId, sid, { lens: l, selection: s }), { replace }),
    [projectId],
  );
  const setLens = (l: Lens) => {
    remember("quoli.lens", l);
    go(sessionId, l, l === "summary" ? null : selection);
  };
  const select = (s: Selection, replace = false) => go(sessionId, view.lens, s, replace);
  const gotoLens = (l: Lens, s: Selection) => {
    remember("quoli.lens", l);
    go(sessionId, l, s);
  };
  const sessionHref = (sid: string | null) =>
    paths.board(projectId, sid, {
      lens: view.lens,
      selection: selection?.kind === "tool" ? null : selection,
    });
  const openSession = (sid: string | null) => navigate(sessionHref(sid));

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the replay when the session changes
  useEffect(() => setCursor(null), [sessionId]);

  const wantGraphRef = useRef(wantGraph);
  wantGraphRef.current = wantGraph;
  const slow = useRef<ReturnType<typeof setTimeout>>(undefined);
  useLiveEvents((m) => {
    refreshProjects();
    if (m.type === "projects") return;
    refreshSessions();
    if (m.sessionId === sessionId) {
      refreshSession();
      refreshReview();
    }
    clearTimeout(slow.current);
    slow.current = setTimeout(() => {
      refreshCode();
      refreshGit();
      if (wantGraphRef.current) refreshGraph.current();
    }, 1500);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (isTypingTarget(e.target as HTMLElement) || modalOpen()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= LENSES.length && (sessionId || !sessionOnly(LENSES[n - 1].id)))
        setLens(LENSES[n - 1].id);
      if (e.key === "Escape" && selection) select(null);
    };
    const open = () => setPalette(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("quoli:palette", open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("quoli:palette", open);
    };
  });

  const ordered = useMemo(
    () => [...(session?.toolCalls ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    [session],
  );
  const visibleCalls = cursor === null ? ordered : ordered.slice(0, cursor + 1);
  const touched = useMemo(() => touchMap(visibleCalls), [visibleCalls]);

  if (!projects) {
    return (
      <div className="page">
        {projectsError ? (
          <ErrorState message={projectsError} retry={refreshProjects} />
        ) : (
          <Loading label="Loading project…" />
        )}
      </div>
    );
  }
  if (!project) {
    return (
      <div className="page">
        <ErrorState
          title="Project not found"
          message="This project is not registered with Quoli and has no recorded events. It may have been deleted."
        />
        <p>
          <Link to={paths.projects()} className="btn">
            Back to Projects
          </Link>
        </p>
      </div>
    );
  }

  const ctx: LensContext = {
    projectId,
    root,
    session: (sessionId ? session : null) as SessionDetail | null,
    calls: visibleCalls,
    touched,
    selection,
    select,
    code,
    codeGraph,
    git,
    infra,
    refreshInfra,
    sessions: sessions ?? [],
    openSession,
  };
  const branch = git?.branches.find((b) => b.current);
  const href = (l: Lens, s: Selection) =>
    paths.board(projectId, sessionId, { lens: l, selection: s });
  const summary = lens === "summary";
  // Summary and Review are pages of their own: no details panel and no replay bar.
  const wide = summary || lens === "review";
  const lensFetch = {
    git: { data: git, error: gitError, retry: refreshGit, what: "Git history" },
    infra: { data: infra, error: infraError, retry: refreshInfra, what: "infrastructure files" },
  };
  const fetched = lens === "git" || lens === "infra" ? lensFetch[lens] : null;
  const blocked = fetched && !fetched.data && fetched.error ? fetched : null;

  // In the Agents lens' Steps view a selected call opens in place, so it needs no side panel.
  const inPlace = lens === "agents" && agentsView === "timeline" && selection?.kind === "tool";
  // Review and Summary use the full width; the Map has its own explorer and code reader.
  const panelOpen = !wide && lens !== "map" && (details || (!!selection && !inPlace));

  return (
    <div
      className={`app ${wide ? "is-summary" : ""} ${listOpen ? "" : "no-list"} ${
        panelOpen ? "" : "no-details"
      } ${sessionId && session && !wide ? "" : "no-replay"}`}
    >
      <header className="topbar">
        <button
          type="button"
          className={`icon-btn ${listOpen ? "on" : ""}`}
          onClick={() => setListOpen(!listOpen)}
          aria-pressed={listOpen}
          aria-label="Sessions list"
          title={listOpen ? "Hide the sessions list" : "Show the sessions list"}
        >
          {Icon.panel}
        </button>
        <select
          className="project-select"
          value={project.id}
          onChange={(e) =>
            navigate(paths.board(e.target.value, null, { lens: view.lens, selection: null }))
          }
          aria-label="Project"
          title={project.root}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {branch && (
          <span className="branch-pill" title={`Current branch: ${branch.name}`}>
            <span className="bp-name">{branch.name}</span>
            {(git?.changed ?? 0) > 0 && <em>{git?.changed} changed</em>}
          </span>
        )}
        <div
          className="lenses"
          role="tablist"
          aria-label="Lens"
          onKeyDown={(e) => {
            const tabs = LENSES.filter((l) => sessionId || !sessionOnly(l.id));
            const to = roveTarget(
              e.key,
              tabs.findIndex((l) => l.id === lens),
              tabs.length,
            );
            if (to === null || e.key === "ArrowUp" || e.key === "ArrowDown") return;
            e.preventDefault();
            setLens(tabs[to].id);
            requestAnimationFrame(() => document.getElementById(`tab-${tabs[to].id}`)?.focus());
          }}
        >
          {LENSES.map((l, i) =>
            sessionOnly(l.id) && !sessionId ? null : (
              <button
                type="button"
                role="tab"
                id={`tab-${l.id}`}
                key={l.id}
                className={lens === l.id ? "active" : ""}
                aria-selected={lens === l.id}
                tabIndex={lens === l.id ? 0 : -1}
                onClick={() => setLens(l.id)}
                title={`${l.label} (${i + 1}) · ${l.hint}`}
              >
                {l.label}
              </button>
            ),
          )}
        </div>
        <p className="lens-job faint">{LENSES.find((l) => l.id === lens)?.hint}</p>
        <button
          type="button"
          className="search-button"
          title={`Search this board (${modKey()}+K)`}
          onClick={() => setPalette(true)}
        >
          {Icon.search}
          <span className="sr-only">Search this board</span>
        </button>
        {!wide && lens !== "map" && (
          <button
            type="button"
            className={`icon-btn ${panelOpen ? "on" : ""}`}
            onClick={() => (selection && !inPlace ? select(null) : toggleDetails())}
            aria-pressed={panelOpen}
            aria-label="Details panel"
            title={
              selection && !inPlace
                ? "Close details (Esc)"
                : details
                  ? "Hide the details panel"
                  : "Show the details panel"
            }
          >
            {Icon.inspector}
          </button>
        )}
      </header>

      {listOpen && (
        <Sidebar
          sessions={sessions}
          activeId={sessionId}
          hrefFor={sessionHref}
          projectPath={project.root}
          total={project.sessions}
          error={sessionsError}
          retry={refreshSessions}
        />
      )}

      {sessionId && session && (
        <SessionHeader
          session={session}
          projectName={projectName(projects, projectId)}
          summaryHref={href("summary", null)}
          review={review}
          reviewHref={href("review", null)}
        />
      )}

      <main className="canvas" id="main" tabIndex={-1}>
        {sessionId ? (
          <h2 className="sr-only">{LENSES.find((l) => l.id === lens)?.label} lens</h2>
        ) : (
          <>
            <h1 className="sr-only">{project.name}</h1>
            <h2 className="sr-only">{LENSES.find((l) => l.id === lens)?.label} lens</h2>
          </>
        )}
        {sessionId && sessionError && !session && (
          <div className="board-notice">
            <ErrorState
              title="Could not load this session"
              message={sessionError}
              retry={refreshSession}
            />
          </div>
        )}
        {summary && sessionId && !session && !sessionError && <Loading label="Loading session…" />}
        {summary && session && <Summary session={session} review={review} href={href} />}
        {lens === "review" && sessionId && !session && !sessionError && (
          <Loading label="Loading session…" />
        )}
        {lens === "review" && session && (
          <ReviewLens
            {...ctx}
            session={session}
            review={review}
            error={reviewError}
            retry={refreshReview}
          />
        )}
        {lens === "agents" && <AgentsLens {...ctx} />}
        {blocked ? (
          <div className="board-notice">
            <ErrorState
              title={`Could not read the ${blocked.what}`}
              message={blocked.error as string}
              retry={blocked.retry}
            />
          </div>
        ) : (
          <>
            {lens === "map" && <MapLens {...ctx} />}
            {lens === "git" && <GitLens {...ctx} />}
            {lens === "infra" && <InfraLens {...ctx} />}
          </>
        )}
      </main>
      {session && <LiveAnnouncer session={session} />}

      {panelOpen && (
        <Inspector
          {...ctx}
          hookStatus={project.hookStatus}
          lens={lens}
          onRefresh={() => {
            refreshCode();
            refreshGit();
            refreshInfra();
          }}
          goto={gotoLens}
        />
      )}

      {sessionId && session && !wide && (
        <Timeline
          session={session}
          calls={ordered}
          cursor={cursor}
          setCursor={setCursor}
          selection={selection}
          select={select}
        />
      )}

      {palette && <Palette {...ctx} close={() => setPalette(false)} goto={gotoLens} />}
    </div>
  );
}

function touchMap(calls: ToolCall[]): Map<string, Touch> {
  const map = new Map<string, Touch>();
  for (const c of calls) {
    for (const f of c.files) {
      const t = map.get(f) ?? { read: 0, edited: 0, calls: [] };
      if (c.category === "edit") t.edited++;
      else t.read++;
      t.calls.push(c.id);
      map.set(f, t);
    }
  }
  return map;
}
