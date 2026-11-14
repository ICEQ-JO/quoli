import { useEffect, useRef, useState } from "react";
import { isTypingTarget, modalOpen } from "./a11y.ts";
import { Toasts, useAlerts } from "./alerts.tsx";
import { api, useData, useLiveEvents } from "./api.ts";
import { ShortcutOverlay } from "./components/Dialog.tsx";
import {
  FirstRun,
  PixelDissolve,
  setFirstRunSkipped,
  useFirstRunSkipped,
} from "./components/FirstRun.tsx";
import { NavSidebar } from "./components/NavSidebar.tsx";
import { type PaletteItem, PaletteView, pageItems } from "./components/Palette.tsx";
import { BoardPage } from "./pages/Board.tsx";
import { DashboardPage } from "./pages/Dashboard.tsx";
import { InsightsPage } from "./pages/Insights.tsx";
import { ProjectsPage } from "./pages/Projects.tsx";
import { SessionsPage } from "./pages/Sessions.tsx";
import { SettingsPage } from "./pages/Settings.tsx";
import { UsagePage } from "./pages/Usage.tsx";
import { Link, navigate, paths, useLocation } from "./router.ts";

export function App() {
  const { pathname, route } = useLocation();
  const [overview, refreshOverview] = useData("shell:overview", api.overview);
  const [projects, refreshProjects] = useData("projects", api.projects);
  useLiveEvents(() => {
    refreshOverview();
    refreshProjects();
  });
  const [settings] = useData("settings", api.settings);
  // A session stops being live without any event, so look again now and then, and catch up
  // as soon as a backgrounded tab is shown again.
  useEffect(() => {
    const t = setInterval(refreshOverview, 30_000);
    const onShow = () => document.visibilityState === "visible" && refreshOverview();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [refreshOverview]);
  const alerts = useAlerts(overview, projects, settings?.settings.budgetDailyUsd ?? null);

  // After moving to another page, start reading at its content rather than at the nav rail.
  const page = useRef(route.name);
  useEffect(() => {
    if (page.current === route.name) return;
    page.current = route.name;
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [route.name]);
  const Main = route.name === "board" ? "div" : "main";

  // No session yet: the first run takes the whole window, and dissolves into the app once the
  // first session arrives (or the person skips it).
  const skipped = useFirstRunSkipped();
  const firstRun = overview?.counts.projects === 0 && !skipped && route.name === "home";
  const wasFirstRun = useRef(false);
  const [dissolve, setDissolve] = useState(false);
  useEffect(() => {
    if (firstRun) wasFirstRun.current = true;
    else if (wasFirstRun.current) {
      wasFirstRun.current = false;
      setDissolve(true);
    }
  }, [firstRun]);
  if (firstRun) return <FirstRun mode="setup" onSkip={() => setFirstRunSkipped(true)} />;

  return (
    <div className="shell">
      {/* biome-ignore lint/a11y/useValidAnchor: a real in-page link that also moves focus */}
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <NavSidebar pathname={pathname} projects={projects} overview={overview} />
      <Main
        className="shell-main"
        id={route.name === "board" ? undefined : "main"}
        tabIndex={route.name === "board" ? undefined : -1}
      >
        {route.name === "home" && <DashboardPage />}
        {route.name === "usage" && <UsagePage />}
        {route.name === "insights" && <InsightsPage />}
        {route.name === "projects" && <ProjectsPage />}
        {route.name === "sessions" && <SessionsPage />}
        {route.name === "settings" && <SettingsPage section={route.section} />}
        {route.name === "board" && (
          <BoardPage
            key={route.projectId}
            projectId={route.projectId}
            sessionId={route.sessionId}
          />
        )}
        {route.name === "notfound" && <NotFound />}
      </Main>
      <Toasts {...alerts} />
      <ShortcutsHost />
      {route.name !== "board" && <GlobalPalette />}
      {dissolve && <PixelDissolve onDone={() => setDissolve(false)} />}
    </div>
  );
}

/** `?` opens the shortcut overlay from anywhere, unless the user is typing or a dialog is open. */
function ShortcutsHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target as HTMLElement) || modalOpen()) return;
      e.preventDefault();
      setOpen(true);
    };
    const show = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("quoli:shortcuts", show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("quoli:shortcuts", show);
    };
  }, []);
  return open ? <ShortcutOverlay close={() => setOpen(false)} /> : null;
}

function NotFound() {
  return (
    <div className="page">
      <div className="state empty">
        <h1 className="state-title">Page not found</h1>
        <span>There is nothing at this address.</span>
        <Link to={paths.home()} className="btn">
          Go Home
        </Link>
      </div>
    </div>
  );
}

/** ⌘K outside the board: jump to pages, projects and sessions. */
function GlobalPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const show = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("quoli:palette", show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("quoli:palette", show);
    };
  }, []);
  if (!open) return null;
  return <GlobalPaletteBody close={() => setOpen(false)} />;
}

function GlobalPaletteBody({ close }: { close: () => void }) {
  const [projects] = useData("projects", api.projects);
  const [sessions] = useData("sessions:all", () => api.sessions());
  const items: PaletteItem[] = [
    ...pageItems(),
    ...(projects ?? []).map((p) => ({
      group: "Projects",
      label: p.name,
      detail: p.root,
      run: () => navigate(paths.board(p.id)),
    })),
    ...(sessions ?? []).map((s) => ({
      group: "Sessions",
      label: s.title,
      detail: s.branch ?? "",
      run: () => navigate(paths.board(s.projectId, s.id)),
    })),
  ];
  return (
    <PaletteView items={items} close={close} placeholder="Go to a page, project or session…" />
  );
}
