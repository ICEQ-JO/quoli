import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionDetail, ToolCall } from "../../shared/model.ts";
import { api, useData, useLiveEvents } from "./api.ts";
import { Inspector } from "./components/Inspector.tsx";
import { Onboarding } from "./components/Onboarding.tsx";
import { Palette } from "./components/Palette.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { AgentsLens } from "./lenses/AgentsLens.tsx";
import { CodeLens } from "./lenses/CodeLens.tsx";
import { GitLens } from "./lenses/GitLens.tsx";
import { InfraLens } from "./lenses/InfraLens.tsx";
import type { Lens, LensContext, Selection, Touch } from "./state.ts";

const LENSES: { id: Lens; label: string; hint: string }[] = [
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

export function App() {
  const [projects, refreshProjects] = useData("projects", api.projects);
  const [chosenRoot, setRoot] = useState<string | null>(() => remember("quoli.root"));
  const root = projects?.find((p) => p.root === chosenRoot)?.root ?? projects?.[0]?.root ?? null;

  const [sessions, refreshSessions] = useData(root, () => api.sessions(root as string));
  // undefined = follow the latest session; null = no session selected
  const [chosenSession, setSession] = useState<string | null | undefined>(undefined);
  const sessionId = chosenSession === undefined ? (sessions?.[0]?.id ?? null) : chosenSession;
  const [session, refreshSession] = useData(sessionId, () => api.session(sessionId as string));

  const [code, refreshCode] = useData(root && `code:${root}`, () => api.code(root as string));
  const [git, refreshGit] = useData(root && `git:${root}`, () => api.git(root as string));
  const [infra, refreshInfra] = useData(root && `infra:${root}`, () => api.infra(root as string));

  const [lens, setLens] = useState<Lens>(() => (remember("quoli.lens") as Lens) ?? "code");
  const [selection, select] = useState<Selection>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [palette, setPalette] = useState(false);

  useEffect(() => void remember("quoli.lens", lens), [lens]);
  useEffect(() => void (root && remember("quoli.root", root)), [root]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset view state when the session changes
  useEffect(() => {
    setCursor(null);
    select((s) => (s?.kind === "tool" ? null : s));
  }, [sessionId]);

  const slow = useRef<ReturnType<typeof setTimeout>>(undefined);
  useLiveEvents((id) => {
    refreshSessions();
    refreshProjects();
    if (id === sessionId) refreshSession();
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
      const n = Number(e.key);
      if (n >= 1 && n <= 4) setLens(LENSES[n - 1].id);
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ordered = useMemo(
    () => [...(session?.toolCalls ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    [session],
  );
  const visibleCalls = cursor === null ? ordered : ordered.slice(0, cursor + 1);
  const touched = useMemo(() => touchMap(visibleCalls), [visibleCalls]);

  if (projects && !projects.length) return <Onboarding />;

  const ctx: LensContext = {
    root,
    session: session as SessionDetail | null,
    calls: visibleCalls,
    touched,
    selection,
    select,
    code,
    git,
    infra,
    sessions: sessions ?? [],
    openSession: (id) => setSession(id),
  };
  const project = projects?.find((p) => p.root === root);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden />
          quoli
        </div>
        <span className="sep">/</span>
        <select
          className="project-select"
          value={root ?? ""}
          onChange={(e) => {
            setRoot(e.target.value);
            setSession(undefined);
            select(null);
          }}
          aria-label="Project"
        >
          {projects?.map((p) => (
            <option key={p.root} value={p.root}>
              {p.name}
            </option>
          ))}
        </select>
        {git?.branches.find((b) => b.current) && (
          <span className="branch-pill" title="Current branch">
            {git.branches.find((b) => b.current)?.name}
            {git.changed > 0 && <em>{git.changed} changed</em>}
          </span>
        )}
        <nav className="lenses" aria-label="Lens">
          {LENSES.map((l, i) => (
            <button
              type="button"
              key={l.id}
              className={lens === l.id ? "active" : ""}
              onClick={() => setLens(l.id)}
              title={`${l.hint} (${i + 1})`}
            >
              {l.label}
            </button>
          ))}
        </nav>
        <button type="button" className="search-button" onClick={() => setPalette(true)}>
          Search <kbd>⌘K</kbd>
        </button>
      </header>

      <Sidebar
        sessions={sessions}
        activeId={sessionId}
        onOpen={(id) => {
          setSession(id);
          if (selection?.kind === "tool") select(null);
        }}
        projectPath={project?.root ?? ""}
      />

      <main className="canvas">
        {lens === "agents" && <AgentsLens {...ctx} />}
        {lens === "code" && <CodeLens {...ctx} />}
        {lens === "git" && <GitLens {...ctx} />}
        {lens === "infra" && <InfraLens {...ctx} />}
      </main>

      <Inspector
        {...ctx}
        onRefresh={() => {
          refreshCode();
          refreshGit();
          refreshInfra();
        }}
        goto={(l, s) => {
          setLens(l);
          select(s);
        }}
      />

      {session && (
        <Timeline
          session={session}
          calls={ordered}
          cursor={cursor}
          setCursor={setCursor}
          selection={selection}
          select={select}
        />
      )}

      {palette && (
        <Palette
          {...ctx}
          close={() => setPalette(false)}
          goto={(l, s) => {
            setLens(l);
            select(s);
            setPalette(false);
          }}
        />
      )}
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
