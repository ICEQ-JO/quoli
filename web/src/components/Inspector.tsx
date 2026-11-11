import { useState } from "react";
import type { SessionDetail, ToolCall } from "../../../shared/model.ts";
import { api, useData } from "../api.ts";
import { ago, CATEGORY, clock, compact, duration, fileName, tokenSum } from "../format.ts";
import { editedUnder, type Lens, type LensContext, type Selection } from "../state.ts";
import { RecordedChange, UnifiedDiff } from "./Diff.tsx";

interface Props extends LensContext {
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
  else if (p.session) body = <SessionPanel {...p} session={p.session} />;
  else body = <ProjectPanel {...p} />;
  return (
    <aside className="inspector">
      {s && (
        <button type="button" className="back" onClick={() => p.select(null)}>
          ← {p.session ? "Session overview" : "Project"}
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

function SessionPanel({ session, goto }: Props & { session: SessionDetail }) {
  const t = session.tokens;
  const total = tokenSum(t) || 1;
  const edited = Object.entries(session.files).filter(([, f]) => f.edited > 0);
  const readOnly = Object.entries(session.files).filter(([, f]) => f.edited === 0);
  const mix = Object.entries(
    session.toolCalls.reduce<Record<string, number>>((m, c) => {
      m[c.category] = (m[c.category] ?? 0) + 1;
      return m;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <header className="panel-head">
        <span className={`status ${session.live ? "live" : ""}`}>
          {session.live ? "Live" : session.endedAt ? "Ended" : "Idle"}
        </span>
        <h2 title={session.title}>{session.title}</h2>
        <p className="meta">
          {[
            session.branch ? (
              <span key="b" className="mono" title={session.branch}>
                {session.branch}
              </span>
            ) : null,
            `started ${ago(session.startedAt)}`,
            duration(session.startedAt, session.endedAt),
          ]
            .filter(Boolean)
            .flatMap((part, i) => (i ? [" · ", part] : [part]))}
        </p>
      </header>
      <div className="stats">
        <Stat label="tool calls" value={session.toolCount} />
        <Stat label="files changed" value={edited.length} tone="edit" />
        <Stat label="failed calls" value={session.failures} tone={session.failures ? "fail" : ""} />
        <Stat label="tokens" value={compact(tokenSum(t))} />
      </div>
      <Section title="Tokens" aside={session.models.join(" · ") || "no usage reported yet"}>
        <div className="token-bar">
          {(["input", "output", "cacheRead", "cacheWrite"] as const).map((k) => (
            <span key={k} className={`seg ${k}`} style={{ width: `${(t[k] / total) * 100}%` }} />
          ))}
        </div>
        <dl className="token-list">
          <dt>
            <i className="sw input" />
            Input
          </dt>
          <dd>{compact(t.input)}</dd>
          <dt>
            <i className="sw output" />
            Output
          </dt>
          <dd>{compact(t.output)}</dd>
          <dt>
            <i className="sw cacheRead" />
            Cache read
          </dt>
          <dd>{compact(t.cacheRead)}</dd>
          <dt>
            <i className="sw cacheWrite" />
            Cache write
          </dt>
          <dd>{compact(t.cacheWrite)}</dd>
        </dl>
        {session.agents.length > 1 && (
          <ul className="agent-list">
            {session.agents.map((a) => (
              <li key={a.id}>
                <span>{a.kind === "main" ? "Main agent" : `Subagent · ${a.type ?? a.id}`}</span>
                <span className="mono">{compact(tokenSum(a.tokens))}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Prompts" aside={String(session.turns.length)}>
        <ol className="prompts">
          {session.turns.map((turn, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: turns are ordered
            <li key={i}>
              <span className="time">{clock(turn.at)}</span>
              <p>{turn.prompt}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Changed files" aside={String(edited.length)}>
        <FileList entries={edited} onPick={(f) => goto("code", { kind: "file", id: f })} />
      </Section>
      {readOnly.length > 0 && (
        <Section title="Read only" aside={String(readOnly.length)}>
          <FileList entries={readOnly} onPick={(f) => goto("code", { kind: "file", id: f })} />
        </Section>
      )}
      <Section title="What it did">
        <ul className="mix">
          {mix.map(([cat, n]) => (
            <li key={cat}>
              <span
                className="mix-label"
                style={
                  { "--c": CATEGORY[cat as ToolCall["category"]].color } as React.CSSProperties
                }
              >
                {CATEGORY[cat as ToolCall["category"]].label}
              </span>
              <span
                className="mix-bar"
                style={{
                  width: `${(n / session.toolCount) * 100}%`,
                  background: CATEGORY[cat as ToolCall["category"]].color,
                }}
              />
              <span className="mono">{n}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function FileList({
  entries,
  onPick,
}: {
  entries: [string, { read: number; edited: number }][];
  onPick: (f: string) => void;
}) {
  if (!entries.length) return <p className="faint">None.</p>;
  return (
    <ul className="file-list">
      {entries.map(([path, f]) => (
        <li key={path}>
          <button type="button" onClick={() => onPick(path)} title={path}>
            <span className="fname" title={path}>
              {fileName(path)}
            </span>
            <span className="fdir">{path.slice(0, -fileName(path).length - 1)}</span>
            {f.edited > 0 && <span className="badge e">✎{f.edited}</span>}
            {f.read > 0 && <span className="badge r">{f.read}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function FilePanel({ path, root, session, code, goto, select }: Props & { path: string }) {
  const [file] = useData(root && `${root}:${path}:${session?.toolCalls.length ?? 0}`, () =>
    api.file(root as string, path),
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
          {meta ? `${meta.lines} lines` : ""}
          {meta && meta.status !== "clean" ? ` · ${meta.status} in git` : ""}
        </p>
      </header>
      <div className="tabs">
        <button
          type="button"
          className={activeTab === "session" ? "active" : ""}
          onClick={() => setTab("session")}
          disabled={!calls.length}
        >
          This session {calls.length ? `(${calls.length})` : ""}
        </button>
        <button
          type="button"
          className={activeTab === "git" ? "active" : ""}
          onClick={() => setTab("git")}
          disabled={!file?.diff}
        >
          Git diff
        </button>
        <button
          type="button"
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
      {activeTab === "source" && <pre className="source">{file?.content ?? "Loading…"}</pre>}
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

function CommitPanel({ sha, git }: Props & { sha: string }) {
  const c = git?.commits.find((x) => x.sha === sha);
  if (!c) return null;
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
