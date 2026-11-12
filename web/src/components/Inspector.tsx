import { useState } from "react";
import type { SessionDetail } from "../../../shared/model.ts";
import { api, useData } from "../api.ts";
import { ago, CATEGORY, clock, duration, fileName } from "../format.ts";
import { editedUnder, type Lens, type LensContext, type Selection } from "../state.ts";
import { RecordedChange, UnifiedDiff } from "./Diff.tsx";
import { ErrorState } from "./ui.tsx";

interface Props extends LensContext {
  lens: Lens;
  goto: (lens: Lens, s: Selection) => void;
  onRefresh: () => void;
}

export function Inspector(p: Props) {
  const s = p.selection;
  let body: React.ReactNode;
  if (s?.kind === "file") body = <FilePanel {...p} path={s.id} />;
  else if (s?.kind === "tool") body = <ToolPanel {...p} id={s.id} />;
  else if (s?.kind === "service") body = <ServicePanel {...p} id={s.id} />;
  else if (s?.kind === "commit") body = <CommitPanel {...p} sha={s.id} />;
  else if (s?.kind === "branch") body = <BranchPanel {...p} name={s.id} />;
  else if (p.session) body = <LensPanel {...p} session={p.session} />;
  else body = <ProjectPanel {...p} />;
  return (
    <aside className="inspector" aria-label="Inspector">
      {s && (
        <button type="button" className="back" onClick={() => p.select(null)}>
          ← {p.session ? "Back to list" : "Project"}
        </button>
      )}
      {body}
    </aside>
  );
}

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="panel-section">
      <h3>
        {title}
        {aside && (
          <span className="aside" title={typeof aside === "string" ? aside : undefined}>
            {aside}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/** What the inspector shows with nothing selected: the part of the session this lens is about. */
function LensPanel(p: Props & { session: SessionDetail }) {
  const { lens, session, goto, select, calls, touched, git, infra, sessions, openSession } = p;
  if (lens === "agents") {
    return (
      <Section title="Tool calls" aside={String(calls.length)}>
        {calls.length === 0 ? (
          <p className="faint">No tool calls were recorded.</p>
        ) : (
          <ul className="call-list">
            {calls.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  title={`${c.name}: ${c.summary}`}
                  onClick={() => select({ kind: "tool", id: c.id })}
                >
                  <span className="cat" style={{ background: CATEGORY[c.category].color }} />
                  <span className="cl-name">{c.name}</span>
                  <span className="cl-sum">{c.summary}</span>
                  <span className={`st ${c.status}`}>{c.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    );
  }
  if (lens === "code") {
    const changed = session.report.changes;
    return (
      <Section title="Changed files" aside={String(changed.length)}>
        {changed.length === 0 ? (
          <p className="faint">No files were changed.</p>
        ) : (
          <ul className="file-list">
            {changed.map((c) => (
              <li key={c.path}>
                <button
                  type="button"
                  title={c.path}
                  onClick={() => select({ kind: "file", id: c.path })}
                >
                  <span className="fname">{fileName(c.path)}</span>
                  <span className="fdir">{c.path.slice(0, -fileName(c.path).length - 1)}</span>
                  <span className="delta">
                    <span className="add">+{c.added}</span>{" "}
                    {c.rewrite ? (
                      <span className="faint">rewritten</span>
                    ) : (
                      <span className="del">−{c.removed}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    );
  }
  if (lens === "git") {
    const branch = git?.branches.find((b) => b.current);
    const ran = branch ? sessions.filter((s) => s.branch === branch.name) : [];
    return (
      <>
        <Section title="Repository now">
          {branch ? (
            <dl className="kv panel-kv">
              <div>
                <dt>Current branch</dt>
                <dd className="mono" title={branch.name}>
                  {branch.name}
                </dd>
              </div>
              <div>
                <dt>Changed files</dt>
                <dd>{git?.changed ?? 0}</dd>
              </div>
            </dl>
          ) : (
            <p className="faint">No Git data for this project.</p>
          )}
        </Section>
        {branch && (
          <Section title="Sessions on this branch" aside={String(ran.length)}>
            {ran.length === 0 ? (
              <p className="faint">No recorded sessions ran on this branch.</p>
            ) : (
              <ul className="links">
                {ran.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      title={s.title}
                      className={s.id === session.id ? "current" : ""}
                      onClick={() => openSession(s.id)}
                    >
                      <b>{s.title}</b> <span className="faint">{ago(s.startedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </>
    );
  }
  const hit = (infra?.services ?? [])
    .map((s) => ({ s, files: editedUnder(touched, s.sourceDir) }))
    .filter((x) => x.files.length > 0);
  return (
    <Section title="Services this session changed" aside={String(hit.length)}>
      {hit.length === 0 ? (
        <p className="faint">
          {infra
            ? "No service's source directory contains a file this session changed."
            : "Infrastructure has not loaded."}
        </p>
      ) : (
        <ul className="links">
          {hit.map(({ s, files }) => (
            <li key={s.id}>
              <button
                type="button"
                title={`${s.name}: ${files.join(", ")}`}
                onClick={() => goto("infra", { kind: "service", id: s.id })}
              >
                <b>{s.name}</b>{" "}
                <span className="faint">
                  {files.length} {files.length === 1 ? "file" : "files"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function FilePanel({ path, root, session, code, goto, select }: Props & { path: string }) {
  const [file, reloadFile, fileError] = useData(
    root && `${root}:${path}:${session?.toolCalls.length ?? 0}`,
    () => api.file(root as string, path),
  );
  const [tab, setTab] = useState<"session" | "git" | "source">("session");
  const meta = code?.files.find((f) => f.path === path);
  const calls = (session?.toolCalls ?? []).filter((c) => c.files.includes(path));
  const edits = calls.filter((c) => c.category === "edit");
  const importers = code?.files.filter((f) => f.imports.includes(path)) ?? [];
  const activeTab = tab === "session" && !calls.length ? (file?.diff ? "git" : "source") : tab;
  return (
    <>
      <header className="panel-head">
        <span className="status">{meta?.language ?? "File"}</span>
        <h2 className="mono" title={path}>
          {fileName(path)}
        </h2>
        <p className="meta mono">{path}</p>
        <p className="meta">
          {meta ? (meta.scanned ? `${meta.lines} lines` : "not scanned (size or count limit)") : ""}
          {meta && meta.status !== "clean" ? ` · ${meta.status} in git` : ""}
        </p>
      </header>
      <div className="tabs" role="tablist" aria-label="File views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "session"}
          className={activeTab === "session" ? "active" : ""}
          onClick={() => setTab("session")}
          disabled={!calls.length}
        >
          This session {calls.length ? `(${calls.length})` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "git"}
          className={activeTab === "git" ? "active" : ""}
          onClick={() => setTab("git")}
          disabled={!file?.diff}
        >
          Git diff
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "source"}
          className={activeTab === "source" ? "active" : ""}
          onClick={() => setTab("source")}
        >
          Source
        </button>
      </div>
      {activeTab === "session" && (
        <>
          {calls.map((c) => (
            <div key={c.id} className="call-card">
              <button
                type="button"
                className="call-line"
                onClick={() => select({ kind: "tool", id: c.id })}
              >
                <span className="cat" style={{ background: CATEGORY[c.category].color }} />
                <span>{c.name}</span>
                <span className="time">{clock(c.startedAt)}</span>
                <span className={`st ${c.status}`}>{c.status}</span>
              </button>
              {c.category === "edit" && <RecordedChange call={c} />}
            </div>
          ))}
          {edits.length === 0 && (
            <p className="faint">This session read the file but did not change it.</p>
          )}
        </>
      )}
      {activeTab === "git" && file?.diff && <UnifiedDiff text={file.diff} />}
      {activeTab === "source" &&
        (file ? (
          <pre className="source">
            {file.content ?? "No preview: the file is binary or too large."}
          </pre>
        ) : fileError ? (
          <ErrorState title="Could not read this file" message={fileError} retry={reloadFile} />
        ) : (
          <p className="faint pad" role="status">
            Loading…
          </p>
        ))}
      {meta?.imports.length || importers.length ? (
        <Section title="Connections">
          <ul className="links">
            {meta?.imports.map((f) => (
              <li key={`o${f}`}>
                <button
                  type="button"
                  title={f}
                  onClick={() => goto("code", { kind: "file", id: f })}
                >
                  imports <b>{fileName(f)}</b>
                </button>
              </li>
            ))}
            {importers.map((f) => (
              <li key={`i${f.path}`}>
                <button
                  type="button"
                  title={f.path}
                  onClick={() => goto("code", { kind: "file", id: f.path })}
                >
                  used by <b>{fileName(f.path)}</b>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

function ToolPanel({ id, session, goto }: Props & { id: string }) {
  const call = session?.toolCalls.find((c) => c.id === id);
  if (!call) return <p className="faint pad">This tool call is not in the selected session.</p>;
  const agent = session?.agents.find((a) => a.id === call.agentId);
  return (
    <>
      <header className="panel-head">
        <span className="status" style={{ color: CATEGORY[call.category].color }}>
          {CATEGORY[call.category].label}
        </span>
        <h2 title={call.name}>{call.name}</h2>
        <p className="meta mono">{call.summary}</p>
        <p className="meta">
          <span className={`st ${call.status}`}>{call.status}</span> · {clock(call.startedAt)} ·{" "}
          {duration(call.startedAt, call.endedAt)} ·{" "}
          {agent?.kind === "subagent" ? `subagent ${agent.type ?? agent.id}` : "main agent"}
        </p>
      </header>
      {call.files.length > 0 && (
        <Section title="Files">
          <ul className="links">
            {call.files.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  title={f}
                  onClick={() => goto("code", { kind: "file", id: f })}
                >
                  <b>{fileName(f)}</b> <span className="faint">{f}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {call.category === "edit" && (
        <Section title="Requested change">
          <RecordedChange call={call} />
        </Section>
      )}
      <Section title="Input">
        <pre className="source">{JSON.stringify(call.input, null, 2)}</pre>
      </Section>
      <Section title={call.status === "failed" ? "Error" : "Result"}>
        <pre className={`source ${call.status === "failed" ? "error" : ""}`}>
          {call.output ?? (call.status === "running" ? "Still running…" : "No result recorded.")}
        </pre>
      </Section>
    </>
  );
}

function ServicePanel({ id, infra, touched, goto }: Props & { id: string }) {
  const s = infra?.services.find((x) => x.id === id);
  if (!s) return null;
  const changed = editedUnder(touched, s.sourceDir);
  const name = (sid: string) => infra?.services.find((x) => x.id === sid)?.name ?? sid;
  const links = infra?.links.filter((l) => l.from === id || l.to === id) ?? [];
  return (
    <>
      <header className="panel-head">
        <span className="status">{s.kind}</span>
        <h2 title={s.name}>{s.name}</h2>
        <p className="meta">
          {s.platform}
          {s.sourceDir !== null && (
            <>
              {" "}
              · <span className="mono">{s.sourceDir || "./"}</span>
            </>
          )}
        </p>
      </header>
      <div className="stats">
        <Stat label="state" value={s.metrics?.state ?? "unknown"} />
        <Stat
          label="CPU"
          value={s.metrics?.cpuPercent != null ? `${s.metrics.cpuPercent.toFixed(1)}%` : "—"}
        />
        <Stat
          label="ports"
          value={s.ports.length ? s.ports.map((p) => p.split(":")[0]).join(", ") : "—"}
        />
      </div>
      {!s.metrics && (
        <p className="note">
          Live metrics appear here for services running in local Docker. Hosted platforms (Vercel,
          Fly, Railway…) need a provider connection, which is not built yet.
        </p>
      )}
      {changed.length > 0 && (
        <Section title="Changed by this session" aside={String(changed.length)}>
          <ul className="links">
            {changed.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  title={f}
                  onClick={() => goto("code", { kind: "file", id: f })}
                >
                  <b>{fileName(f)}</b> <span className="faint">{f}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Connections">
        {links.length ? (
          <ul className="links">
            {links.map((l) => (
              <li key={`${l.from}${l.to}`}>
                <button
                  type="button"
                  title={name(l.from === id ? l.to : l.from)}
                  onClick={() =>
                    goto("infra", { kind: "service", id: l.from === id ? l.to : l.from })
                  }
                >
                  {l.from === id
                    ? `${l.kind.replace("_", " ")} → `
                    : `← ${l.kind.replace("_", " ")} by `}
                  <b>{name(l.from === id ? l.to : l.from)}</b>
                  {l.basis === "inferred" && <span className="faint"> · inferred</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint">None found.</p>
        )}
      </Section>
      <Section title="How Quoli knows">
        <p className="note">
          {s.basis === "inferred" ? "Inferred" : "Declared"} in{" "}
          <span className="mono">{s.evidence}</span>.{" "}
          {s.basis === "inferred"
            ? "A dependency or convention suggests this service; it may not exist in every environment."
            : "Read directly from a configuration file in the repository."}
        </p>
      </Section>
    </>
  );
}

function CommitPanel({ sha, git, root, sessions, openSession }: Props & { sha: string }) {
  const loaded = git?.commits.find((x) => x.sha === sha);
  // Commits paged in by the Git lens are not in the board's first page; look them up once.
  const [deep, reloadDeep, deepError] = useData(
    !loaded && root ? `commit:${root}:${sha}` : null,
    () => api.git(root as string, 2000),
  );
  const c = loaded ?? deep?.commits.find((x) => x.sha === sha);
  if (!c && deepError)
    return (
      <ErrorState title="Could not look up this commit" message={deepError} retry={reloadDeep} />
    );
  if (!c)
    return (
      <p className="faint pad" role="status">
        {deep ? "Commit not found in the loaded history." : "Loading commit…"}
      </p>
    );
  const madeBy = sessions.filter((s) => c.sessions?.includes(s.id));
  return (
    <>
      <header className="panel-head">
        <span className="status mono">{c.sha}</span>
        <h2 title={c.subject}>{c.subject}</h2>
        <p className="meta">
          {c.author} · {ago(c.at)}
        </p>
      </header>
      {c.refs.length > 0 && (
        <Section title="Refs">
          <p className="mono">{c.refs.join(", ")}</p>
        </Section>
      )}
      <Section title="Parents">
        <p className="mono">{c.parents.join(", ") || "root commit"}</p>
      </Section>
      {madeBy.length > 0 && (
        <Section title="Created by session" aside="recorded">
          <ul className="links">
            {madeBy.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => openSession(s.id)} title={s.title}>
                  <b>{s.title}</b>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function BranchPanel({ name, git, sessions, openSession }: Props & { name: string }) {
  const b = git?.branches.find((x) => x.name === name);
  if (!b) return null;
  const ran = sessions.filter((s) => s.branch === name);
  return (
    <>
      <header className="panel-head">
        <span className="status">{b.current ? "Checked out" : "Branch"}</span>
        <h2 className="mono" title={b.name}>
          {b.name}
        </h2>
        <p className="meta">
          {b.upstream ? `tracks ${b.upstream}` : "no upstream"} · last commit {ago(b.lastCommitAt)}
        </p>
      </header>
      <Section title="Agent sessions on this branch" aside={String(ran.length)}>
        {ran.length ? (
          <ul className="links">
            {ran.map((s) => (
              <li key={s.id}>
                <button type="button" title={s.title} onClick={() => openSession(s.id)}>
                  <b>{s.title}</b> <span className="faint">{ago(s.startedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint">No recorded sessions ran on this branch.</p>
        )}
      </Section>
    </>
  );
}

function ProjectPanel({ root, sessions, code, git, infra, onRefresh }: Props) {
  return (
    <>
      <header className="panel-head">
        <span className="status">Project</span>
        <h2 title={root ?? undefined}>{root?.split("/").at(-1)}</h2>
        <p className="meta mono">{root}</p>
      </header>
      <div className="stats">
        <Stat label="sessions" value={sessions.length} />
        <Stat label="files" value={code?.files.length ?? "—"} />
        <Stat label="branches" value={git?.branches.length ?? "—"} />
        <Stat label="services" value={infra?.services.length ?? "—"} />
      </div>
      <p className="note">
        Pick a session on the left to light up what the agent did across every lens.
      </p>
      <button type="button" className="ghost" onClick={onRefresh}>
        Rescan repository
      </button>
    </>
  );
}
