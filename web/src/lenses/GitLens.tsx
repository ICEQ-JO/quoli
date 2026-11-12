import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Branch, Commit, GitState, Remote, SessionSummary } from "../../../shared/model.ts";
import { onRoveKey } from "../a11y.ts";
import { api } from "../api.ts";
import { ago, plural } from "../format.ts";
import { isSelected, type LensContext } from "../state.ts";
import "./git/git.css";
import { assignLanes, type LaneRow, reachable } from "./git/lanes.ts";
import { mergeRefs, refTitle } from "./git/refs.ts";

const ROW = 28;
const OVERSCAN = 12;
const PAGE = 200;
export const LANE_COLORS = [
  "var(--text)",
  "var(--edit)",
  "var(--read)",
  "var(--ok)",
  "var(--agent)",
  "var(--search)",
  "var(--web)",
];

const hasBranches = (g: GitState | null) => (g?.branches.length ?? 0) > 0;

export function GitLens(ctx: LensContext) {
  const { git: base, sessions, session, selection, select, openSession, root } = ctx;

  // Pagination: Board loads the first page; "Load more" asks the API for a larger one.
  const [limit, setLimit] = useState(PAGE);
  const [ext, setExt] = useState<GitState | null>(null);
  const [loading, setLoading] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `base` identity signals a refresh
  useEffect(() => {
    if (!root || limit <= PAGE) return setExt(null);
    let live = true;
    setLoading(true);
    api
      .git(root, limit)
      .then((g) => live && setExt(g))
      .catch(() => {})
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [root, limit, base]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the project changes
  useEffect(() => setLimit(PAGE), [root]);
  const git = limit > PAGE && ext ? ext : base;

  const layout = useMemo(() => assignLanes(git?.commits ?? [], LANE_COLORS.length), [git?.commits]);
  const titles = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const onBranch = useMemo(() => {
    const head = git?.branches.find((b) => b.name === session?.branch)?.head;
    return git && head ? reachable(git.commits, head) : null;
  }, [git, session?.branch]);
  const branchColor = useMemo(() => {
    const m = new Map<string, number>();
    git?.commits.forEach((c, i) => {
      m.set(c.sha, layout.rows[i]?.color ?? 0);
    });
    return m;
  }, [git?.commits, layout]);

  const scroller = useRef<HTMLDivElement>(null);
  const ready = hasBranches(git);
  const [view, setView] = useState({ top: 0, height: 800 });
  // biome-ignore lint/correctness/useExhaustiveDependencies: the scroller mounts once `ready`
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () =>
      setView((v) =>
        v.top === el.scrollTop && v.height === el.clientHeight
          ? v
          : { top: el.scrollTop, height: el.clientHeight },
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  if (!git?.branches.length) {
    return (
      <div className="git-lens">
        <p className="git-empty">
          {git ? "This project has no Git branches yet." : "Reading Git history…"}
        </p>
      </div>
    );
  }

  const current = git.branches.find((b) => b.current);
  const remoteNames = git.remotes.map((r) => r.name);
  const lead = git.changed > 0 ? 1 : 0;
  const total = git.commits.length + lead;
  const first = Math.max(0, Math.floor(view.top / ROW) - OVERSCAN);
  const last = Math.min(total, Math.ceil((view.top + view.height) / ROW) + OVERSCAN);
  const width = layout.width;
  const step = Math.max(6, Math.min(14, 150 / width));
  const gutter = Math.max(1, width) * step + 10;

  const rows = [];
  for (let i = first; i < last; i++) {
    if (i < lead) {
      rows.push(
        <div
          key="worktree"
          className="g-row worktree"
          style={{ top: i * ROW }}
          title={`${plural(git.changed, "uncommitted file")}${current ? ` on ${current.name}` : ""}`}
        >
          <svg className="g-lanes" width={gutter} height={ROW} aria-hidden="true">
            <title>Uncommitted changes</title>
            <circle cx={5 + step / 2} cy={ROW / 2} r={4} className="g-dot dashed" />
          </svg>
          <span className="g-subject">Uncommitted changes · {plural(git.changed, "file")}</span>
          {current && <span className="g-ref head">{current.name}</span>}
        </div>,
      );
      continue;
    }
    const c = git.commits[i - lead];
    const lane = layout.rows[i - lead];
    rows.push(
      <CommitRow
        key={c.sha}
        top={i * ROW}
        commit={c}
        lane={lane}
        step={step}
        gutter={gutter}
        selected={isSelected(selection, "commit", c.sha)}
        dim={onBranch ? !onBranch.has(c.sha) : false}
        hot={onBranch ? onBranch.has(c.sha) : false}
        titles={titles}
        tabStop={i === Math.max(first, lead)}
        activeId={session?.id}
        remotes={remoteNames}
        currentBranch={current?.name ?? null}
        onSelect={() => select({ kind: "commit", id: c.sha })}
        openSession={openSession}
      />,
    );
  }

  return (
    <div className="git-lens">
      <RepoHeader root={root} remotes={git.remotes} lastFetch={git.lastFetch} />
      <BranchList
        hasRemote={git.remotes.length > 0}
        branches={git.branches}
        sessions={sessions}
        selection={selection}
        colors={branchColor}
        activeBranch={session?.branch ?? null}
        onSelect={(name) => select({ kind: "branch", id: name })}
      />
      <div
        className="g-scroll"
        ref={scroller}
        onScroll={(e) =>
          setView({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })
        }
      >
        <div className="g-body" style={{ height: total * ROW + 110 }}>
          {rows}
          <div className="g-more" style={{ top: total * ROW + 8 }}>
            {git.hasMore ? (
              <button
                type="button"
                className="g-more-btn"
                disabled={loading}
                onClick={() => setLimit((l) => l + PAGE)}
              >
                {loading ? "Loading…" : `Load more (showing ${git.commits.length})`}
              </button>
            ) : (
              <span className="g-end">Full history · {plural(git.commits.length, "commit")}</span>
            )}
          </div>
        </div>
      </div>
      <div className="legend g-legend">
        <span className="g-lg">
          <svg width="10" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="4" fill="var(--muted)" />
          </svg>
          commit
        </span>
        <span className="g-lg">
          <svg width="10" height="10" aria-hidden="true">
            <circle cx="5" cy="5" r="3.5" fill="none" stroke="var(--muted)" strokeWidth="2" />
          </svg>
          merge
        </span>
        <span className="g-ref local">{git.remotes.length ? "local branch" : "branch"}</span>
        {git.remotes.length > 0 && (
          <>
            <span className="g-ref synced">
              pushed
              <PushedIcon />
            </span>
            <span className="g-ref remote">{git.remotes[0]?.name}/… remote only</span>
          </>
        )}
        <span className="g-session">commit made by a session</span>
      </div>
    </div>
  );
}

function RepoHeader({
  root,
  remotes,
  lastFetch,
}: {
  root: string | null;
  remotes: Remote[];
  lastFetch: string | null;
}) {
  const name = root?.split("/").filter(Boolean).at(-1) ?? "repository";
  return (
    <div className="g-header">
      <span className="g-where" title={root ?? ""}>
        <b>Local Git</b>
        <span className="mono">{name}</span>
      </span>
      {remotes.length === 0 ? (
        <span className="faint">No remote configured</span>
      ) : (
        remotes.map((r) => (
          <span key={r.name} className="g-remote">
            <span className="mono faint">{r.name}</span>
            {r.web ? (
              <a href={r.web} target="_blank" rel="noreferrer noopener" className="mono">
                {r.display}
              </a>
            ) : (
              <span className="mono">{r.display ?? "local path"}</span>
            )}
          </span>
        ))
      )}
      <span
        className="g-fetch faint"
        title="Quoli reads your repository with git on this machine; it never calls GitHub. Remote branches are what your last git fetch saw."
      >
        {remotes.length > 0
          ? lastFetch
            ? `remote branches as of your last fetch, ${ago(lastFetch)}`
            : "never fetched: remote branches may be missing"
          : "read with git on this machine"}
      </span>
    </div>
  );
}

function PushedIcon() {
  return (
    <svg className="g-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 12.5h7a3 3 0 00.4-6 4 4 0 00-7.6-1A3.3 3.3 0 004.5 12.5z" />
      <path d="M6.3 9.2l1.3 1.3 2.4-2.6" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg className="g-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5v4l6 6 5-5-6-6h-4z" />
      <circle cx="5.3" cy="5.3" r="0.9" />
    </svg>
  );
}

function commitLabel(c: Commit, titles: Map<string, SessionSummary>): string {
  const parts = [`${c.parents.length > 1 ? "Merge commit" : "Commit"} ${c.sha}`, c.subject];
  parts.push(`by ${c.author}, ${ago(c.at)}`);
  if (c.refs.length) parts.push(`refs ${c.refs.join(", ")}`);
  const made = (c.sessions ?? []).map((id) => titles.get(id)?.title ?? id);
  if (made.length) parts.push(`created by session ${made.join(", ")}`);
  return parts.join(", ");
}

function CommitRow(p: {
  top: number;
  commit: Commit;
  lane: LaneRow;
  step: number;
  gutter: number;
  selected: boolean;
  dim: boolean;
  hot: boolean;
  titles: Map<string, SessionSummary>;
  tabStop: boolean;
  activeId: string | undefined;
  remotes: string[];
  currentBranch: string | null;
  onSelect: () => void;
  openSession: (id: string) => void;
}) {
  const { commit: c, lane, step } = p;
  const x = (l: number) => 5 + l * step + step / 2;
  const mid = ROW / 2;
  const col = (n: number) => LANE_COLORS[n % LANE_COLORS.length];
  const merge = c.parents.length > 1;
  const tags = mergeRefs(c.refs, p.remotes, p.currentBranch);
  const refs = tags.slice(0, 3);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a row that holds other buttons, not a form group
    <div
      role="group"
      tabIndex={p.tabStop ? 0 : -1}
      aria-label={commitLabel(c, p.titles)}
      aria-current={p.selected ? "true" : undefined}
      className={`rove g-row ${p.selected ? "selected" : ""} ${p.hot ? "hot" : ""} ${p.dim ? "dim" : ""}`}
      style={{ top: p.top }}
      onClick={p.onSelect}
      onKeyDown={onRoveKey}
    >
      <svg className="g-lanes" width={p.gutter} height={ROW} aria-hidden="true">
        <title>{`${c.sha} ${merge ? "merge" : "commit"}`}</title>
        {lane.pass.map((s) => (
          <line
            key={`p${s.lane}`}
            x1={x(s.lane)}
            x2={x(s.lane)}
            y1={0}
            y2={ROW}
            stroke={col(s.color)}
          />
        ))}
        {lane.into.map((s) =>
          s.lane === lane.col ? (
            <line
              key={`i${s.lane}`}
              x1={x(s.lane)}
              x2={x(s.lane)}
              y1={0}
              y2={mid}
              stroke={col(s.color)}
            />
          ) : (
            <path
              key={`i${s.lane}`}
              d={`M${x(s.lane)} 0 C${x(s.lane)} 9 ${x(lane.col)} 5 ${x(lane.col)} ${mid}`}
              stroke={col(s.color)}
              fill="none"
            />
          ),
        )}
        {lane.out.map((s) =>
          s.lane === lane.col ? (
            <line
              key={`o${s.lane}-${s.color}`}
              x1={x(lane.col)}
              x2={x(lane.col)}
              y1={mid}
              y2={ROW}
              stroke={col(s.color)}
            />
          ) : (
            <path
              key={`o${s.lane}-${s.color}`}
              d={`M${x(lane.col)} ${mid} C${x(lane.col)} 19 ${x(s.lane)} 23 ${x(s.lane)} ${ROW}`}
              stroke={col(s.color)}
              fill="none"
            />
          ),
        )}
        <circle
          cx={x(lane.col)}
          cy={mid}
          r={merge ? 3.5 : 4.5}
          fill={merge ? "var(--bg)" : col(lane.color)}
          stroke={col(lane.color)}
          strokeWidth={2}
        />
      </svg>
      <span className="g-sha mono">{c.sha}</span>
      <span className="g-main">
        <span className="g-subject" title={`${c.sha} · ${c.subject}`}>
          {c.subject}
        </span>
        {refs.map((t) => (
          <span
            key={`${t.kind}:${t.name}`}
            className={`g-ref ${t.kind} ${t.current ? "current" : ""}`}
            title={refTitle(t)}
          >
            {t.kind === "tag" && <TagIcon />}
            {t.name}
            {t.kind === "synced" && <PushedIcon />}
          </span>
        ))}
        {tags.length > refs.length && (
          <span className="g-ref more" title={tags.slice(3).map(refTitle).join("\n")}>
            +{tags.length - refs.length}
          </span>
        )}
        {(c.sessions ?? []).map((id) => {
          const s = p.titles.get(id);
          const label = s?.title ?? id;
          return (
            <button
              type="button"
              key={id}
              tabIndex={-1}
              className={`g-session ${id === p.activeId ? "active" : ""}`}
              title={`Session that created this commit: ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                p.openSession(id);
              }}
            >
              {label}
            </button>
          );
        })}
      </span>
      <span className="g-author" title={c.author}>
        {c.author}
      </span>
      <span className="g-time" title={c.at}>
        {ago(c.at)}
      </span>
    </div>
  );
}

function BranchList(p: {
  hasRemote: boolean;
  branches: Branch[];
  sessions: SessionSummary[];
  selection: LensContext["selection"];
  colors: Map<string, number>;
  activeBranch: string | null;
  onSelect: (name: string) => void;
}) {
  const ordered = useMemo(
    () => [...p.branches].sort((a, b) => Number(b.current) - Number(a.current)),
    [p.branches],
  );
  const row = useRef<HTMLDivElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const opts = useRef<(HTMLButtonElement | null)[]>([]);
  // Every chip stays rendered so its width can be read; chips past `fit` are hidden and clipped.
  const [fit, setFit] = useState(ordered.length);
  const [, setWidth] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Runs after every render (one cheap pass over the chips); setFit bails out when unchanged.
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const kids = [...el.querySelectorAll<HTMLElement>(".g-branch")];
    const gap = 6;
    const reserve = 104; // room for the "+N more" button
    let used = 0;
    let n = 0;
    for (const k of kids) {
      const w = k.offsetWidth + (n ? gap : 0);
      const room = el.clientWidth - (n === kids.length - 1 ? 0 : reserve);
      if (used + w > room) break;
      used += w;
      n++;
    }
    setFit(Math.max(1, n));
  });

  const hidden = ordered.slice(fit);

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus the current branch only when the list opens
  useEffect(() => {
    if (!open) return;
    const sel = ordered.findIndex((b) => isSelected(p.selection, "branch", b.name));
    opts.current[Math.max(0, sel)]?.focus();
    const away = (e: MouseEvent) => {
      if (!(e.target as Element).closest(".g-branches")) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => {
    if (!hidden.length) setOpen(false);
  }, [hidden.length]);

  const choose = (name: string) => {
    setOpen(false);
    p.onSelect(name);
  };
  const onListKey = (e: React.KeyboardEvent, i: number) => {
    const go = (n: number) => {
      e.preventDefault();
      opts.current[(n + ordered.length) % ordered.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(ordered.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      setOpen(false);
      moreBtn.current?.focus();
    }
  };

  return (
    <div className="g-branches">
      <div className="g-chips" ref={row}>
        {ordered.map((b, bi) => {
          const ran = p.sessions.filter((s) => s.branch === b.name);
          return (
            <button
              type="button"
              key={b.name}
              inert={bi >= fit}
              className={`g-branch ${bi >= fit ? "off" : ""} ${isSelected(p.selection, "branch", b.name) ? "selected" : ""} ${
                b.name === p.activeBranch ? "active" : ""
              }`}
              onClick={() => p.onSelect(b.name)}
              title={`${b.name}${b.upstream ? ` tracks ${b.upstream}${b.ahead ? `, ${b.ahead} not pushed` : ""}${b.behind ? `, ${b.behind} not pulled` : ""}` : ": local only, never pushed"}${
                ran.length ? `\nSessions: ${ran.map((s) => s.title).join("; ")}` : ""
              }`}
            >
              <span
                className="swatch"
                style={{
                  background: LANE_COLORS[(p.colors.get(b.head) ?? 0) % LANE_COLORS.length],
                }}
              />
              <span className="g-bname">{b.name}</span>
              {b.current && <span className="g-tag">HEAD</span>}
              {!b.upstream && p.hasRemote && <span className="g-meta">local only</span>}
              {b.ahead > 0 && <span className="g-meta">↑{b.ahead}</span>}
              {b.behind > 0 && <span className="g-meta">↓{b.behind}</span>}
              {ran.length > 0 && (
                <span className="g-meta agent">{plural(ran.length, "session")}</span>
              )}
            </button>
          );
        })}
      </div>
      {hidden.length > 0 && (
        <>
          <button
            type="button"
            ref={moreBtn}
            className="g-branch g-morebtn"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            onClick={() => setOpen((o) => !o)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
              }
            }}
          >
            +{hidden.length} more
          </button>
          {open && (
            <div
              id={listId}
              className="g-pop"
              role="listbox"
              aria-label={`All ${p.branches.length} branches`}
            >
              {ordered.map((b, i) => {
                return (
                  <button
                    type="button"
                    role="option"
                    key={b.name}
                    ref={(el) => {
                      opts.current[i] = el;
                    }}
                    tabIndex={-1}
                    aria-selected={isSelected(p.selection, "branch", b.name)}
                    className={`g-opt ${isSelected(p.selection, "branch", b.name) ? "selected" : ""}`}
                    onClick={() => choose(b.name)}
                    onKeyDown={(e) => onListKey(e, i)}
                  >
                    <span
                      className="swatch"
                      style={{
                        background: LANE_COLORS[(p.colors.get(b.head) ?? 0) % LANE_COLORS.length],
                      }}
                    />
                    <span className="g-bname">{b.name}</span>
                    {b.current && <span className="g-tag">HEAD</span>}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
