import { useEffect, useRef, useState } from "react";
import {
  AGENT_NAMES,
  type AgentKind,
  type Project,
  type SetupStatus,
} from "../../../shared/model.ts";
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
import { Link, navigate, paths, useLocation } from "../router.ts";
import { isInternalAgentWorktree } from "../worktrees.ts";

export function hookLabel(p: Project): string {
  if (p.recording === false) return "Not recording · you stopped it";
  if (p.hookStatus === "receiving")
    return `Receiving events${p.lastActivity ? ` · last event ${ago(p.lastActivity)}` : ""}`;
  if (p.hookStatus === "installed") return "Hooks installed · waiting for the first event";
  return "Not connected";
}

export function HookBadge({ project }: { project: Project }) {
  const label = hookLabel(project);
  return (
    <span
      className={`badge-status ${project.recording === false ? "not_connected" : project.hookStatus}`}
      title={label}
    >
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

/** Agents Quoli can connect: hooks for Claude Code and Codex, a plugin for OpenCode, an extension for Pi. */
const HOOK_AGENTS: AgentKind[] = ["claude-code", "codex", "opencode", "pi"];

const WAITING: Record<AgentKind, string> = {
  "claude-code": "waiting for the first event: start claude in the repo",
  codex: "waiting for trust: run codex in the repo and approve Quoli's hooks with /hooks",
  opencode: "waiting for the first event: start opencode in the repo",
  pi: "waiting for the first event: start pi in the repo",
};

const PLUGIN_NOTE: Partial<Record<AgentKind, string>> = {
  opencode: " The plugin is .opencode/plugins/quoli.js, kept out of Git.",
  pi: " The extension is .pi/extensions/quoli.ts, kept out of Git.",
};

/** One line per agent with hooks installed: receiving, or what the user still has to do. */
function AgentHooks({ project }: { project: Project }) {
  if (!project.agents.length) return null;
  return (
    <ul className="agent-hooks">
      {project.agents.map(({ agent, status, everywhere }) => (
        <li key={agent}>
          <span className="agent-tag">{AGENT_NAMES[agent]}</span>{" "}
          {status === "receiving"
            ? "receiving"
            : everywhere
              ? `set up for every repository: start ${agent === "claude-code" ? "claude" : agent} here`
              : WAITING[agent]}
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
  const [showInternal, setShowInternal] = useState(false);
  useNow();
  useLiveEvents(refresh);
  // The sidebar's + opens /projects?connect (#39): the form is open and focused, also after reload.
  const { search } = useLocation();
  const connecting = new URLSearchParams(search).has("connect");
  const connectRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!connecting || !connectRef.current) return;
    connectRef.current.open = true;
    connectRef.current.scrollIntoView({ block: "nearest" });
    // After App moves focus to the page's main region on navigation (App.tsx).
    const raf = requestAnimationFrame(() => document.getElementById("connect-path")?.focus());
    return () => cancelAnimationFrame(raf);
  }, [connecting]);

  // A row's More menu closes on a click elsewhere or Escape.
  useEffect(() => {
    const close = (except: EventTarget | null) => {
      for (const d of document.querySelectorAll<HTMLDetailsElement>(".row-more[open]"))
        if (!(except instanceof Node && d.contains(except))) d.open = false;
    };
    const onDown = (e: PointerEvent) => close(e.target);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const addAgent = async (p: Project, agent: AgentKind) => {
    setBusy(p.id);
    setRowError(({ [p.id]: _, ...rest }) => rest);
    try {
      await api.connectProject(p.root, [agent]);
      setNotice(
        agent === "codex"
          ? `Added Codex hooks to ${p.name} (.codex/hooks.json, kept out of Git). Run codex there and approve them with /hooks.`
          : `Added ${AGENT_NAMES[agent]} to ${p.name}.${PLUGIN_NOTE[agent] ?? ""}`,
      );
      refresh();
    } catch (e) {
      setRowError((r) => ({ ...r, [p.id]: e instanceof Error ? e.message : String(e) }));
    }
    setBusy(null);
  };

  const toggleRecording = async (p: Project) => {
    setBusy(p.id);
    setRowError(({ [p.id]: _, ...rest }) => rest);
    try {
      const on = p.recording === false;
      await api.setRecording(p.id, on);
      setNotice(
        on
          ? `Recording ${p.name} again.`
          : `Stopped recording ${p.name}. New sessions there are not saved; recorded data is kept.`,
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
      <PageHead title="Projects">
        Repositories Quoli has recorded. Projects appear here on their first session.
      </PageHead>
      <EveryRepository onChange={refresh} />
      <details
        className="connect-one"
        ref={connectRef}
        onToggle={(e) => {
          if (!e.currentTarget.open && connecting) navigate(paths.projects(), { replace: true });
        }}
      >
        <summary>Connect one repository instead</summary>
        <ConnectForm
          onConnected={(p) => {
            setNotice(null);
            refresh();
            return p;
          }}
        />
      </details>
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
          <span>
            Set up recording above, then start a session in any repository. Or restart Quoli with
            pnpm demo for a sample.
          </span>
        </EmptyState>
      )}
      {projects && projects.length > 0 && (
        <>
          {(() => {
            const hiddenInternal = projects.filter(isInternalAgentWorktree).length;
            return (
              hiddenInternal > 0 && (
                <div className="table-note">
                  <span className="faint">
                    {hiddenInternal} internal agent{" "}
                    {hiddenInternal === 1 ? "worktree is" : "worktrees are"} hidden.
                  </span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowInternal((v) => !v)}
                    aria-pressed={showInternal}
                  >
                    {showInternal ? "Hide internal worktrees" : "Show internal worktrees"}
                  </button>
                </div>
              )
            );
          })()}
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll this overflow region. */}
          <section className="table-scroll" aria-label="Connected projects" tabIndex={0}>
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
                {projects
                  .filter((p) => showInternal || !isInternalAgentWorktree(p))
                  .map((p) => (
                    <tr key={p.id}>
                      <td className="cell-main">
                        <Link to={paths.board(p.id)} className="strong" title={p.name}>
                          {p.name}
                        </Link>
                        {p.github && (
                          <a
                            className="gh-repo"
                            href={`https://github.com/${p.github}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Open on GitHub"
                          >
                            {p.github}
                          </a>
                        )}
                        <code className="path" title={p.root}>
                          {p.root}
                        </code>
                      </td>
                      <td className="hooks">
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
                        <button
                          type="button"
                          className="btn"
                          disabled={busy === p.id}
                          title={
                            p.recording === false
                              ? "Save new sessions in this repository again"
                              : "New sessions here are not saved. Hooks and recorded sessions stay."
                          }
                          onClick={() => toggleRecording(p)}
                        >
                          {p.recording === false ? "Record again" : "Stop recording"}
                        </button>
                        <details className="row-more">
                          <summary className="btn" aria-label={`More actions for ${p.name}`}>
                            More
                          </summary>
                          <div className="row-more-menu">
                            {p.agents.length < HOOK_AGENTS.length && (
                              <div className="row-more-item">
                                <select
                                  className="input add-agent"
                                  aria-label={`Record another agent's sessions in ${p.name}`}
                                  disabled={busy === p.id}
                                  value=""
                                  onChange={(e) => addAgent(p, e.target.value as AgentKind)}
                                >
                                  <option value="">Add agent…</option>
                                  {HOOK_AGENTS.filter(
                                    (a) => !p.agents.some((x) => x.agent === a),
                                  ).map((a) => (
                                    <option key={a} value={a}>
                                      {AGENT_NAMES[a]}
                                    </option>
                                  ))}
                                </select>
                                <p>Installs that agent's hooks in this repository.</p>
                              </div>
                            )}
                            <div className="row-more-item">
                              <button
                                type="button"
                                className="btn"
                                disabled={!p.agents.some((a) => !a.everywhere) || busy === p.id}
                                onClick={(e) => {
                                  e.currentTarget.closest("details")?.removeAttribute("open");
                                  disconnect(p);
                                }}
                              >
                                Disconnect
                              </button>
                              <p>
                                {p.agents.some((a) => !a.everywhere)
                                  ? "Removes Quoli's hooks from this repository's files. Recorded sessions stay."
                                  : p.agents.length
                                    ? "Recorded through the setup for every repository; remove that at the top of this page."
                                    : "No hooks are installed in this repository."}
                              </p>
                            </div>
                            <div className="row-more-item">
                              <button
                                type="button"
                                className="btn danger"
                                onClick={(e) => {
                                  e.currentTarget.closest("details")?.removeAttribute("open");
                                  setDeleting(p);
                                }}
                              >
                                Delete data…
                              </button>
                              <p>
                                Permanently erases this project's recorded sessions and removes its
                                hooks. Your repository files are not touched. Asks first.
                              </p>
                            </div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        </>
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
        The top level of a git repository. Quoli adds its hooks to .claude/settings.local.json
        (Claude Code) or .codex/hooks.json (Codex), its plugin to .opencode/plugins/quoli.js
        (OpenCode) or its extension to .pi/extensions/quoli.ts (Pi), and keeps the Codex, OpenCode
        and Pi files out of Git. Same as pnpm connect.
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
          {done.agents.some((a) => a.agent === "opencode") && (
            <code className="path"> cd {done.root} && opencode</code>
          )}
          {done.agents.some((a) => a.agent === "pi") && (
            <code className="path"> cd {done.root} && pi</code>
          )}
        </p>
      )}
    </form>
  );
}

/**
 * The user-level install: one click records every repository for each agent found on this
 * machine. Same as `pnpm quoli-setup`.
 */
function EveryRepository({ onChange }: { onChange: () => void }) {
  const [status, refresh, error] = useData("setup", api.setupStatus);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (!status) return error ? <ErrorState message={error} retry={refresh} /> : null;
  const found = status.filter((s) => s.found);
  const missing = found.filter((s) => !s.installed);
  const installed = status.filter((s) => s.installed);
  const run = async (agents: AgentKind[] | undefined, remove: boolean) => {
    setBusy(true);
    setFailure(null);
    try {
      await api.setup(agents, remove);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
    refresh();
    onChange();
    setBusy(false);
  };
  return (
    <section className="card every-repo" aria-labelledby="every-repo-title">
      <div className="every-head">
        <div>
          <h2 id="every-repo-title">Record every repository</h2>
          <p className="faint">
            Set up once per agent and every repository you open with it is recorded, with nothing to
            connect per project. Sessions run while Quoli is closed appear when it starts.
          </p>
        </div>
        <div className="every-actions">
          {missing.length > 0 && (
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() =>
                run(
                  missing.map((s) => s.agent),
                  false,
                )
              }
            >
              {busy ? "Setting up…" : installed.length ? "Set up the rest" : "Set up"}
            </button>
          )}
          {installed.length > 0 && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                run(
                  installed.map((s) => s.agent),
                  true,
                )
              }
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <ul className="every-list">
        {status.map((s) => (
          <SetupRow key={s.agent} s={s} />
        ))}
      </ul>
      {failure && (
        <p className="form-error" role="alert">
          {failure}
        </p>
      )}
    </section>
  );
}

function SetupRow({ s }: { s: SetupStatus }) {
  const state = s.installed ? "on" : s.found ? "off" : "absent";
  return (
    <li className={`every-row ${state}`}>
      <i aria-hidden="true" />
      <span className="every-name">{AGENT_NAMES[s.agent]}</span>
      <span className="every-state">
        {s.installed
          ? s.agent === "codex"
            ? "Set up · approve Quoli's hooks once with /hooks in codex"
            : "Set up"
          : s.found
            ? "Not set up"
            : "Not found on this machine"}
      </span>
      <code className="path" title={s.file}>
        {s.file}
      </code>
    </li>
  );
}
