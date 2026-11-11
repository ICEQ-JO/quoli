import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionDetail, ToolCall } from "../../../shared/model.ts";
import { api, useData, useLiveEvents } from "../api.ts";
import { Inspector } from "../components/Inspector.tsx";
import { Palette } from "../components/Palette.tsx";
import { SessionHeader } from "../components/SessionHeader.tsx";
import { Sidebar } from "../components/Sidebar.tsx";
import { Summary } from "../components/Summary.tsx";
import { Timeline } from "../components/Timeline.tsx";
import { ErrorState, Loading, projectName } from "../components/ui.tsx";
import { AgentsLens } from "../lenses/AgentsLens.tsx";
import { CodeLens } from "../lenses/CodeLens.tsx";
import { GitLens } from "../lenses/GitLens.tsx";
import { InfraLens } from "../lenses/InfraLens.tsx";
import { Link, navigate, parseBoardQuery, paths, useLocation } from "../router.ts";
import type { Lens, LensContext, Selection, Touch } from "../state.ts";

const LENSES: { id: Lens; label: string; hint: string }[] = [
  { id: "summary", label: "Summary", hint: "What was asked, changed, run and spent" },
  { id: "agents", label: "Agents", hint: "What the agent did" },
  { id: "code", label: "Code", hint: "Where it happened" },
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
    : view.lens && view.lens !== "summary"
      ? view.lens
      : isLens(remembered) && remembered !== "summary"
        ? remembered
        : "code";
  const selection = view.selection;

  const [projects, refreshProjects, projectsError] = useData("projects", api.projects);
  const project = projects?.find((p) => p.id === projectId) ?? null;
  const root = project?.root ?? null;

  const [sessions, refreshSessions] = useData(`sessions:${projectId}`, () =>
    api.sessions(projectId),
  );
  const [session, refreshSession, sessionError] = useData(sessionId, () =>
    api.session(sessionId as string),
  );
  const [code, refreshCode] = useData(root && `code:${root}`, () => api.code(root as string));
  const [git, refreshGit] = useData(root && `git:${root}`, () => api.git(root as string));
  const [infra, refreshInfra] = useData(root && `infra:${root}`, () => api.infra(root as string));

  const [cursor, setCursor] = useState<number | null>(null);
  const [palette, setPalette] = useState(false);

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
  const select = (s: Selection) => go(sessionId, view.lens, s);
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

  const slow = useRef<ReturnType<typeof setTimeout>>(undefined);
  useLiveEvents((m) => {
    refreshProjects();
    if (m.type === "projects") return;
    refreshSessions();
    if (m.sessionId === sessionId) refreshSession();
    clearTimeout(slow.current);
    slow.current = setTimeout(() => {
      refreshCode();
      refreshGit();
    }, 1500);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= LENSES.length && (sessionId || LENSES[n - 1].id !== "summary"))
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
    root,
    session: (sessionId ? session : null) as SessionDetail | null,
    calls: visibleCalls,
    touched,
    selection,
    select,
    code,
    git,
    infra,
    sessions: sessions ?? [],
    openSession,
  };
  const branch = git?.branches.find((b) => b.current);
  const href = (l: Lens, s: Selection) =>
    paths.board(projectId, sessionId, { lens: l, selection: s });
  const summary = lens === "summary";

  return (
    <div className={`app ${summary ? "is-summary" : ""}`}>
      <header className="topbar">
        <Link to={paths.projects()} className="crumb" title="Back to Projects">
          Projects
        </Link>
        <span className="sep">/</span>
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
        <nav className="lenses" aria-label="Lens">
          {LENSES.map((l, i) =>
            l.id === "summary" && !sessionId ? null : (
              <button
                type="button"
                key={l.id}
                className={lens === l.id ? "active" : ""}
                aria-pressed={lens === l.id}
                onClick={() => setLens(l.id)}
                title={`${l.hint} (${i + 1})`}
              >
                {l.label}
              </button>
            ),
          )}
        </nav>
        <button type="button" className="search-button" onClick={() => setPalette(true)}>
          Search <kbd>⌘K</kbd>
        </button>
      </header>

      <Sidebar
        sessions={sessions}
        activeId={sessionId}
        hrefFor={sessionHref}
        projectPath={project.root}
      />

      {sessionId && session && (
        <SessionHeader
          session={session}
          projectName={projectName(projects, projectId)}
          summaryHref={href("summary", null)}
        />
      )}

      <main className="canvas">
        {sessionId && sessionError && !session && (
          <div className="board-notice">
            <ErrorState title="Session not found" message={sessionError} />
          </div>
        )}
        {summary && sessionId && !session && !sessionError && <Loading label="Loading session…" />}
        {summary && session && <Summary session={session} href={href} />}
        {lens === "agents" && <AgentsLens {...ctx} />}
        {lens === "code" && <CodeLens {...ctx} />}
        {lens === "git" && <GitLens {...ctx} />}
        {lens === "infra" && <InfraLens {...ctx} />}
      </main>

      {!summary && (
        <Inspector
          {...ctx}
          lens={lens}
          onRefresh={() => {
            refreshCode();
            refreshGit();
            refreshInfra();
          }}
          goto={gotoLens}
        />
      )}

      {sessionId && session && !summary && (
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
