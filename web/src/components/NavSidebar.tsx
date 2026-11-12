import type { Overview, Project } from "../../../shared/model.ts";
import { modKey } from "../a11y.ts";
import { Link, paths } from "../router.ts";
import { Icon } from "./ui.tsx";

interface Props {
  pathname: string;
  projects: Project[] | null;
  overview: Overview | null;
}

/** The app's main navigation: pages, then every project, then settings. */
export function NavSidebar({ pathname, projects, overview }: Props) {
  const live = overview?.live ?? [];
  const liveIn = (id: string) => live.filter((s) => s.projectId === id).length;
  const item = (
    to: string,
    label: string,
    icon: React.ReactNode,
    active: boolean,
    aside?: React.ReactNode,
  ) => (
    <li>
      <Link
        to={to}
        className={`nav-item ${active ? "active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        {icon}
        <span className="nav-label">{label}</span>
        {aside}
      </Link>
    </li>
  );
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-top">
        <Link to={paths.home()} className="nav-brand" aria-label="Quoli dashboard">
          <span className="logo" aria-hidden />
          <span>Quoli</span>
        </Link>
        <button
          type="button"
          className="nav-search"
          onClick={() => window.dispatchEvent(new Event("quoli:palette"))}
        >
          {Icon.search}
          <span>Search</span>
          <kbd>{modKey() === "⌘" ? "⌘K" : "Ctrl K"}</kbd>
        </button>
      </div>

      <ul className="nav-list">
        {item(paths.home(), "Dashboard", Icon.dashboard, pathname === "/")}
        {item(
          paths.sessions(),
          "Sessions",
          Icon.sessions,
          pathname.startsWith("/sessions"),
          live.length > 0 && (
            <span className="nav-live" title={`${live.length} live`}>
              <i aria-hidden />
              {live.length}
            </span>
          ),
        )}
        {item(paths.usage(), "Usage", Icon.usage, pathname.startsWith("/usage"))}
      </ul>

      <div className="nav-section">
        <Link
          to={paths.projects()}
          className={`nav-heading ${pathname === "/projects" ? "active" : ""}`}
        >
          Projects
        </Link>
        <Link
          to={paths.projects()}
          className="nav-add"
          title="Connect a repository"
          aria-label="Connect a repository"
        >
          {Icon.plus}
        </Link>
      </div>
      <ul className="nav-list nav-projects">
        {projects === null && <li className="nav-note">Loading…</li>}
        {projects?.length === 0 && (
          <li className="nav-note">
            <Link to={paths.projects()}>Connect a repository</Link>
          </li>
        )}
        {projects?.map((p) => {
          const n = liveIn(p.id);
          const active = pathname.startsWith(`/projects/${p.id}`);
          return (
            <li key={p.id}>
              <Link
                to={paths.board(p.id)}
                className={`nav-item nav-project ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                title={p.root}
              >
                <span className={`nav-dot ${n ? "live" : p.hookStatus}`} aria-hidden />
                <span className="nav-label">{p.name}</span>
                <span className="nav-count">
                  {n ? `${n} live` : p.sessions}
                  {!n && <span className="sr-only"> sessions</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="nav-list nav-bottom">
        {item(paths.settings(), "Settings", Icon.settings, pathname.startsWith("/settings"))}
        <li>
          <button
            type="button"
            className="nav-item"
            onClick={() => window.dispatchEvent(new Event("quoli:shortcuts"))}
          >
            {Icon.keyboard}
            <span className="nav-label">Shortcuts</span>
            <kbd>?</kbd>
          </button>
        </li>
      </ul>
    </nav>
  );
}
