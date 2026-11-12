import { useEffect, useRef, useState } from "react";
import { isTypingTarget, modalOpen, modKey } from "./a11y.ts";
import { api, useData, useLiveEvents } from "./api.ts";
import { ShortcutOverlay } from "./components/Dialog.tsx";
import { type PaletteItem, PaletteView, pageItems } from "./components/Palette.tsx";
import { Icon } from "./components/ui.tsx";
import { BoardPage } from "./pages/Board.tsx";
import { HomePage } from "./pages/Home.tsx";
import { ProjectsPage } from "./pages/Projects.tsx";
import { SessionsPage } from "./pages/Sessions.tsx";
import { SettingsPage } from "./pages/Settings.tsx";
import { Link, navigate, paths, useLocation } from "./router.ts";

const NAV = [
  { label: "Home", to: paths.home(), icon: Icon.home, match: (p: string) => p === "/" },
  {
    label: "Projects",
    to: paths.projects(),
    icon: Icon.projects,
    match: (p: string) => p.startsWith("/projects"),
  },
  {
    label: "Sessions",
    to: paths.sessions(),
    icon: Icon.sessions,
    match: (p: string) => p.startsWith("/sessions"),
  },
  {
    label: "Settings",
    to: paths.settings(),
    icon: Icon.settings,
    match: (p: string) => p.startsWith("/settings"),
  },
];

export function App() {
  const { pathname, route } = useLocation();
  const [overview, refreshOverview] = useData("shell:overview", api.overview);
  useLiveEvents(refreshOverview);
  // A session stops being live without any event, so look again now and then.
  useEffect(() => {
    const t = setInterval(refreshOverview, 30_000);
    return () => clearInterval(t);
  }, [refreshOverview]);
  const live = overview?.live.length ?? 0;

  // After moving to another page, start reading at its content rather than at the nav rail.
  const page = useRef(route.name);
  useEffect(() => {
    if (page.current === route.name) return;
    page.current = route.name;
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [route.name]);
  const Main = route.name === "board" ? "div" : "main";

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
      <nav className="rail" aria-label="Main">
        <Link to={paths.home()} className="rail-brand" aria-label="Quoli home" title="Quoli">
          <span className="logo" aria-hidden />
        </Link>
        <ul>
          {NAV.map((n) => {
            const current = n.match(pathname);
            return (
              <li key={n.to}>
                <Link
                  to={n.to}
                  className={`rail-link ${current ? "active" : ""}`}
                  aria-current={current ? "page" : undefined}
                >
                  {n.icon}
                  <span>{n.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="rail-foot">
          <button
            type="button"
            className="rail-link"
            title={`Search (${modKey()}+K)`}
            onClick={() => window.dispatchEvent(new Event("quoli:palette"))}
          >
            {Icon.search}
            <span>Search</span>
          </button>
          <button
            type="button"
            className="rail-link"
            title="Keyboard shortcuts (?)"
            onClick={() => window.dispatchEvent(new Event("quoli:shortcuts"))}
          >
            {Icon.keyboard}
            <span>Shortcuts</span>
          </button>
          {live > 0 && (
            <Link
              to={paths.sessions()}
              className="live-indicator"
              title={`${live} live ${live === 1 ? "session" : "sessions"}`}
            >
              <i aria-hidden="true" />
              Live <b>{live}</b>
            </Link>
          )}
        </div>
      </nav>
      <Main
        className="shell-main"
        id={route.name === "board" ? undefined : "main"}
        tabIndex={route.name === "board" ? undefined : -1}
      >
        {route.name === "home" && <HomePage />}
        {route.name === "projects" && <ProjectsPage />}
        {route.name === "sessions" && <SessionsPage />}
        {route.name === "settings" && <SettingsPage />}
        {route.name === "board" && (
          <BoardPage
            key={route.projectId}
            projectId={route.projectId}
            sessionId={route.sessionId}
          />
        )}
        {route.name === "notfound" && <NotFound />}
      </Main>
      <ShortcutsHost />
      {route.name !== "board" && <GlobalPalette />}
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
        <strong>Page not found</strong>
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
