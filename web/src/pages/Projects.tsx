import { useState } from "react";
import { AGENT_NAMES, type AgentKind, type Project } from "../../../shared/model.ts";
import { api, useData, useLiveEvents } from "../api.ts";
import {
  DeleteDataDialog,
  EmptyState,
  ErrorState,
  Loading,
  PageHead,
  useNow,
} from "../components/ui.tsx";
import { ago, plural } from "../format.ts";
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

/** Agents Quoli can install hooks for. OpenCode capture comes through a plugin (#118). */
const HOOK_AGENTS: AgentKind[] = ["claude-code", "codex"];

/** One line per agent with hooks installed: receiving, or what the user still has to do. */
function AgentHooks({ project }: { project: Project }) {
  if (!project.agents.length) return null;
  return (
    <ul className="agent-hooks">
      {project.agents.map(({ agent, status }) => (
        <li key={agent}>
          <span className="agent-tag">{AGENT_NAMES[agent]}</span>{" "}
          {status === "receiving"
            ? "receiving"
            : agent === "codex"
              ? "waiting for trust: run codex in the repo and approve Quoli's hooks with /hooks"
              : "waiting for the first event"}
        </li>
      ))}
    </ul>
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

  const addCodex = async (p: Project) => {
    setBusy(p.id);
    setRowError(({ [p.id]: _, ...rest }) => rest);
    try {
      await api.connectProject(p.root, ["codex"]);
      setNotice(
        `Added Codex hooks to ${p.name} (.codex/hooks.json, kept out of Git). Run codex there and approve them with /hooks.`,
      );
      refresh();
    } catch (e) {
      setRowError((r) => ({ ...r, [p.id]: e instanceof Error ? e.message : String(e) }));
    }
    setBusy(null);
  };

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
                  <AgentHooks project={p} />
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
                  {p.hookStatus !== "not_connected" &&
                    !p.agents.some((a) => a.agent === "codex") && (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy === p.id}
                        title="Install Quoli's hooks for Codex in this repository too"
                        onClick={() => addCodex(p)}
                      >
                        Add Codex
                      </button>
                    )}
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
              `Deleted ${plural(r.events, "event")} from ${plural(r.sessions, "session")} of ${deleting.name}.`,
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
  const [agents, setAgents] = useState<AgentKind[]>(["claude-code"]);
  const toggle = (a: AgentKind, on: boolean) =>
    setAgents((list) => (on ? [...list, a] : list.filter((x) => x !== a)));
  return (
    <form
      className="card connect"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setDone(null);
        try {
          const p = onConnected(await api.connectProject(path.trim(), agents));
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
        <button
          type="submit"
          className="btn primary"
          disabled={busy || !path.trim() || !agents.length}
        >
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      <fieldset className="agent-choice">
        <legend>Record sessions from</legend>
        {HOOK_AGENTS.map((a) => (
          <label key={a} className="check">
            <input
              type="checkbox"
              checked={agents.includes(a)}
              onChange={(e) => toggle(a, e.target.checked)}
            />
            {AGENT_NAMES[a]}
          </label>
        ))}
      </fieldset>
      <p id="connect-help" className="faint">
        The top level of a git repository. Quoli adds its hooks to that repo's local Claude Code
        settings (.claude/settings.local.json) and, for Codex, to .codex/hooks.json, which it keeps
        out of Git. Same as pnpm connect.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice" role="status">
          Connected {done.name}. Next: start a new session in that repo
          {done.agents.some((a) => a.agent === "claude-code") && (
            <code className="path"> cd {done.root} && claude</code>
          )}
          {done.agents.some((a) => a.agent === "codex") && (
            <>
              <code className="path"> cd {done.root} && codex</code> then approve Quoli's hooks with{" "}
              <code>/hooks</code> (Codex runs project hooks only once you trust them).
            </>
          )}
        </p>
      )}
    </form>
  );
}
