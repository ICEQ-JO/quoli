import { useEffect, useMemo, useRef, useState } from "react";
import type { Branch, Commit, GitState, SessionSummary } from "../../../shared/model.ts";
import { api } from "../api.ts";
import { ago } from "../format.ts";
import { isSelected, type LensContext } from "../state.ts";
import "./git/git.css";
import { assignLanes, type LaneRow, reachable } from "./git/lanes.ts";

const ROW = 28;
const OVERSCAN = 12;
const PAGE = 200;
export const LANE_COLORS = [
  "#ececef",
  "#ff6a2b",
  "#4da3ff",
  "#3ecf8e",
  "#a78bfa",
  "#f5c451",
  "#f472b6",
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
          title={`${git.changed} uncommitted files${current ? ` on ${current.name}` : ""}`}
        >
          <svg className="g-lanes" width={gutter} height={ROW} aria-hidden="true">
            <title>Uncommitted changes</title>
            <circle cx={5 + step / 2} cy={ROW / 2} r={4} className="g-dot dashed" />
          </svg>
          <span className="g-subject">
            Uncommitted changes · {git.changed} {git.changed === 1 ? "file" : "files"}
          </span>
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
        activeId={session?.id}
        onSelect={() => select({ kind: "commit", id: c.sha })}
        openSession={openSession}
      />,
    );
  }

  return (
    <div className="git-lens">
      <BranchList
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
        <div className="g-body" style={{ height: total * ROW + 56 }}>
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
              <span className="g-end">Full history · {git.commits.length} commits</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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
  activeId: string | undefined;
  onSelect: () => void;
  openSession: (id: string) => void;
}) {
  const { commit: c, lane, step } = p;
  const x = (l: number) => 5 + l * step + step / 2;
  const mid = ROW / 2;
  const col = (n: number) => LANE_COLORS[n % LANE_COLORS.length];
  const merge = c.parents.length > 1;
  const refs = c.refs.slice(0, 3);
  return (
    // biome-ignore lint/a11y/useSemanticElements: the row contains other buttons (session chips)
    <div
      role="button"
      tabIndex={0}
      className={`g-row ${p.selected ? "selected" : ""} ${p.hot ? "hot" : ""} ${p.dim ? "dim" : ""}`}
      style={{ top: p.top }}
      onClick={p.onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && p.onSelect()}
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
        {refs.map((r) => (
          <span key={r} className={`g-ref ${/^tag: /.test(r) ? "tag" : ""}`} title={r}>
            {r.replace(/^tag: /, "")}
          </span>
        ))}
        {c.refs.length > refs.length && (
          <span className="g-ref" title={c.refs.slice(3).join(", ")}>
            +{c.refs.length - refs.length}
          </span>
        )}
        {(c.sessions ?? []).map((id) => {
          const s = p.titles.get(id);
          const label = s?.title ?? id;
          return (
            <button
              type="button"
              key={id}
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
  branches: Branch[];
  sessions: SessionSummary[];
  selection: LensContext["selection"];
  colors: Map<string, number>;
  activeBranch: string | null;
  onSelect: (name: string) => void;
}) {
  const ordered = [...p.branches].sort((a, b) => Number(b.current) - Number(a.current));
  return (
    <div className="g-branches">
      {ordered.map((b) => {
        const ran = p.sessions.filter((s) => s.branch === b.name);
        return (
          <button
            type="button"
            key={b.name}
            className={`g-branch ${isSelected(p.selection, "branch", b.name) ? "selected" : ""} ${
              b.name === p.activeBranch ? "active" : ""
            }`}
            onClick={() => p.onSelect(b.name)}
            title={`${b.name}${b.upstream ? ` → ${b.upstream}` : ""}${
              ran.length ? `\nSessions: ${ran.map((s) => s.title).join("; ")}` : ""
            }`}
          >
            <span
              className="swatch"
              style={{ background: LANE_COLORS[(p.colors.get(b.head) ?? 0) % LANE_COLORS.length] }}
            />
            <span className="g-bname">{b.name}</span>
            {b.current && <span className="g-tag">HEAD</span>}
            {b.ahead > 0 && <span className="g-meta">↑{b.ahead}</span>}
            {b.behind > 0 && <span className="g-meta">↓{b.behind}</span>}
            {ran.length > 0 && (
              <span className="g-meta agent">
                {ran.length} {ran.length === 1 ? "session" : "sessions"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
