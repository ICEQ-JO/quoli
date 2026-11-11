import { useState } from "react";
import type { Project } from "../../../shared/model.ts";
import { api, useData, useLiveEvents } from "../api.ts";
import {
  DeleteDataDialog,
  EmptyState,
  ErrorState,
  Loading,
  PageHead,
  useNow,
} from "../components/ui.tsx";
import { ago } from "../format.ts";
import { Link, paths } from "../router.ts";

export function hookLabel(p: Project): string {
  if (p.hookStatus === "receiving")
    return `Receiving events${p.lastActivity ? ` · last event ${ago(p.lastActivity)}` : ""}`;
  if (p.hookStatus === "installed") return "Hooks installed · waiting for the first event";
  return "Not connected";
}

export function HookBadge({ project }: { project: Project }) {
  const label = hookLabel(project);
  return (
    <span className={`badge-status ${project.hookStatus}`} title={label}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function ProjectsPage() {
  const [projects, refresh, error] = useData("projects", api.projects);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  useNow();
  useLiveEvents(refresh);

  const disconnect = async (p: Project) => {
    setBusy(p.id);
    setRowError(({ [p.id]: _, ...rest }) => rest);
    try {
      await api.disconnectProject(p.id);
      setNotice(`Disconnected ${p.name}. Quoli's hooks were removed; recorded data is kept.`);
      refresh();
    } catch (e) {
      setRowError((r) => ({ ...r, [p.id]: e instanceof Error ? e.message : String(e) }));
    }
    setBusy(null);
  };

  return (
    <div className="page">
      <PageHead title="Projects">Repositories Quoli listens to, and what it has recorded.</PageHead>
      <ConnectForm
        onConnected={(p) => {
          setNotice(null);
          refresh();
          return p;
        }}
      />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {!projects && (error ? <ErrorState message={error} retry={refresh} /> : <Loading />)}
      {projects && error && (
        <ErrorState title="Showing the last data we had" message={error} retry={refresh} />
      )}
      {projects?.length === 0 && (
        <EmptyState title="No projects yet">
          <span>Connect a repository above, or restart Quoli with pnpm demo for a sample.</span>
        </EmptyState>
      )}
      {projects && projects.length > 0 && (
        <table className="table projects">
          <caption className="sr-only">Connected projects</caption>
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Hooks</th>
              <th scope="col" className="num">
                Sessions
              </th>
              <th scope="col">Last activity</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td className="cell-main">
                  <Link to={paths.board(p.id)} className="strong" title={p.name}>
                    {p.name}
                  </Link>
                  <code className="path" title={p.root}>
                    {p.root}
                  </code>
                </td>
                <td>
                  <HookBadge project={p} />
                  {rowError[p.id] && (
                    <p className="form-error" role="alert">
                      {rowError[p.id]}
                    </p>
                  )}
                </td>
                <td className="num">{p.sessions}</td>
                <td className="nowrap">{p.lastActivity ? ago(p.lastActivity) : "never"}</td>
                <td className="actions">
                  <Link to={paths.board(p.id)} className="btn">
                    Open
                  </Link>
                  <button
                    type="button"
                    className="btn"
                    disabled={p.hookStatus === "not_connected" || busy === p.id}
                    title={
                      p.hookStatus === "not_connected"
                        ? "Hooks are not installed"
                        : "Remove Quoli's hooks; keep the recorded data"
                    }
                    onClick={() => disconnect(p)}
                  >
                    Disconnect
                  </button>
                  <button type="button" className="btn danger" onClick={() => setDeleting(p)}>
                    Delete data
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {deleting && (
        <DeleteDataDialog
          project={deleting}
          close={() => setDeleting(null)}
          done={(r) => {
            setNotice(
              `Deleted ${r.events} events from ${r.sessions} ${r.sessions === 1 ? "session" : "sessions"} of ${deleting.name}.`,
            );
            setDeleting(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ConnectForm({ onConnected }: { onConnected: (p: Project) => Project }) {
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Project | null>(null);
  return (
    <form
      className="card connect"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setDone(null);
        try {
          const p = onConnected(await api.connectProject(path.trim()));
          setDone(p);
          setPath("");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
        setBusy(false);
      }}
    >
      <h2>Connect a repository</h2>
      <div className="field-row">
        <label htmlFor="connect-path" className="sr-only">
          Absolute path to a git repository
        </label>
        <input
          id="connect-path"
          className="input mono"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/absolute/path/to/your/repo"
          spellCheck={false}
          autoComplete="off"
          aria-describedby="connect-help"
        />
        <button type="submit" className="btn primary" disabled={busy || !path.trim()}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      <p id="connect-help" className="faint">
        The top level of a git repository. Quoli adds its hooks to that repo's .claude settings,
        like pnpm connect does.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice" role="status">
          Connected {done.name}. Next: start a new Claude Code session in that repo
          <code className="path"> cd {done.root} && claude</code>
        </p>
      )}
    </form>
  );
}
