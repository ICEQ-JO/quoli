import { useEffect, useRef, useState } from "react";
import type { Project, SessionSummary } from "../../../shared/model.ts";
import { api } from "../api.ts";
import { ago, compact } from "../format.ts";
import { Link, paths } from "../router.ts";

/** Re-render every `ms` so relative times ("2m ago") stay honest. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="state" role="status">
      {label}
    </p>
  );
}

export function ErrorState({
  title = "Could not load this",
  message,
  retry,
}: {
  title?: string;
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="state error" role="alert">
      <strong>{title}</strong>
      <span>{message}</span>
      {retry && (
        <button type="button" className="btn" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="state empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function PageHead({
  title,
  children,
  actions,
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {children && <p className="lede">{children}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function LiveDot({ live }: { live: boolean }) {
  return (
    <span
      className={`live-dot ${live ? "on" : ""}`}
      role="img"
      aria-label={live ? "Live" : "Not running"}
      title={live ? "Live" : "Not running"}
    />
  );
}

/** Project name for a session, by id. */
export const projectName = (projects: Project[] | null, id: string) =>
  projects?.find((p) => p.id === id)?.name ?? "Unknown project";

export function SessionRow({
  session,
  projects,
}: {
  session: SessionSummary;
  projects: Project[] | null;
}) {
  const name = projectName(projects, session.projectId);
  return (
    <li className="srow">
      <LiveDot live={session.live} />
      <Link
        to={paths.board(session.projectId, session.id)}
        className="srow-title"
        title={session.title}
      >
        {session.title}
      </Link>
      <span className="srow-meta">
        <span title={name}>{name}</span>
        {session.branch && (
          <span className="mono" title={session.branch}>
            {session.branch}
          </span>
        )}
        <span>{session.live ? "live now" : ago(session.startedAt)}</span>
        {session.failures > 0 && <span className="fail">{session.failures} failed</span>}
      </span>
    </li>
  );
}

export function TokenBreakdown({ tokens }: { tokens: SessionSummary["tokens"] }) {
  const rows: [string, number][] = [
    ["Input", tokens.input],
    ["Output", tokens.output],
    ["Cache read", tokens.cacheRead],
    ["Cache write", tokens.cacheWrite],
  ];
  return (
    <dl className="kv">
      {rows.map(([label, n]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className="mono" title={n.toLocaleString()}>
            {compact(n)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Describes exactly what a "Delete data" action removes, and asks first. */
export function DeleteDataDialog({
  project,
  close,
  done,
}: {
  project: Project;
  close: () => void;
  done: (result: { events: number; sessions: number }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => cancel.current?.focus(), []);
  const n = project.sessions;
  return (
    <div className="modal-backdrop">
      <button type="button" className="palette-scrim" aria-label="Cancel" onClick={close} />
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="del-title"
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        <h2 id="del-title">Delete data for {project.name}?</h2>
        <p>This permanently deletes, from Quoli's local database:</p>
        <ul>
          <li>
            every recorded event of the {n} {n === 1 ? "session" : "sessions"} in this project
          </li>
          <li>their token usage rows and transcript read positions</li>
        </ul>
        <p>It also removes Quoli's hooks from this repository and unregisters the project.</p>
        <p className="faint">
          Not deleted: your repository files, Claude Code's own transcripts, and other projects.
          This cannot be undone.
        </p>
        <code className="path" title={project.root}>
          {project.root}
        </code>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button ref={cancel} type="button" className="btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                done(await api.deleteProject(project.id));
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : "Delete data"}
          </button>
        </div>
      </div>
    </div>
  );
}

const svg = (d: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);

export const Icon = {
  home: svg(
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v10h12V10" />
    </>,
  ),
  projects: svg(
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  ),
  sessions: svg(<path d="M4 6h16M4 12h16M4 18h10" />),
  settings: svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>,
  ),
  search: svg(
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4-4" />
    </>,
  ),
};
