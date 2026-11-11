import { type Edge, Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { useMemo } from "react";
import type { Branch, Commit, SessionSummary } from "../../../shared/model.ts";
import { ago, compact, tokenSum } from "../format.ts";
import { isSelected, type LensContext } from "../state.ts";
import { Board } from "./Board.tsx";

const STEP = 96;
const LANE = 150;
const LABEL_W = 230;
const COLORS = ["#ececef", "#ff6a2b", "#4da3ff", "#3ecf8e", "#a78bfa", "#f5c451", "#f472b6"];

export function GitLens(ctx: LensContext) {
  const { git, sessions, session, selection, select, openSession } = ctx;

  const { nodes, edges } = useMemo(() => {
    if (!git?.branches.length) return { nodes: [], edges: [] };
    const trunk = (b: Branch) => (/^(main|master|trunk|develop)$/.test(b.name) ? 0 : 1);
    const branches = [...git.branches].sort((a, b) => trunk(a) - trunk(b));
    const byShaFull = new Map(git.commits.map((c) => [c.sha, c]));
    const laneOf = new Map<string, number>();
    branches.forEach((b, lane) => {
      let sha: string | undefined = b.head;
      while (sha && byShaFull.has(sha) && !laneOf.has(sha)) {
        laneOf.set(sha, lane);
        sha = byShaFull.get(sha)?.parents[0];
      }
    });
    const ordered = [...git.commits].reverse(); // oldest first
    const xOf = new Map(ordered.map((c, i) => [c.sha, LABEL_W + i * STEP]));
    const end = LABEL_W + ordered.length * STEP + 30;
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    branches.forEach((b, lane) => {
      nodes.push({
        id: `branch:${b.name}`,
        type: "branch",
        position: { x: 0, y: lane * LANE - 14 },
        data: {
          branch: b,
          color: COLORS[lane % COLORS.length],
          selected: isSelected(selection, "branch", b.name),
        },
      });
      const ran = sessions.filter((s) => s.branch === b.name);
      let x = end;
      if (b.current && git.changed) {
        nodes.push({
          id: "worktree",
          type: "worktree",
          position: { x, y: lane * LANE - 14 },
          data: { changed: git.changed },
        });
        edges.push(link(b.head, "worktree", COLORS[lane % COLORS.length], true));
        x += 190;
      }
      ran.slice(0, 3).forEach((s, i) => {
        nodes.push({
          id: `session:${s.id}`,
          type: "session",
          position: { x, y: lane * LANE - 24 + i * 46 },
          data: { session: s, active: s.id === session?.id },
        });
      });
    });

    for (const c of ordered) {
      const lane = laneOf.get(c.sha);
      if (lane === undefined) continue;
      nodes.push({
        id: c.sha,
        type: "commit",
        position: { x: xOf.get(c.sha) ?? 0, y: lane * LANE - 9 },
        data: {
          commit: c,
          color: COLORS[lane % COLORS.length],
          selected: isSelected(selection, "commit", c.sha),
        },
      });
      for (const p of c.parents) {
        if (laneOf.has(p)) edges.push(link(p, c.sha, COLORS[lane % COLORS.length]));
      }
    }
    return { nodes, edges };
  }, [git, sessions, session, selection]);

  return (
    <Board
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitKey={`git:${git?.commits[0]?.sha ?? ""}:${git?.branches.length}`}
      onNodeClick={(n) => {
        if (n.type === "commit") select({ kind: "commit", id: n.id });
        if (n.type === "branch") select({ kind: "branch", id: n.id.slice(7) });
        if (n.type === "session") openSession(n.id.slice(8));
      }}
      onPaneClick={() => select(null)}
      empty={git ? "This project has no Git branches yet." : "Reading Git history…"}
      legend={
        <>
          <span>Recent commits on local branches, oldest → newest</span>
          <span className="lg agentchip">agent session on this branch</span>
        </>
      }
    />
  );
}

function link(from: string, to: string, color: string, dashed = false): Edge {
  return {
    id: `${from}->${to}`,
    source: from,
    target: to,
    type: "smoothstep",
    style: {
      stroke: color,
      strokeWidth: 2,
      opacity: 0.75,
      strokeDasharray: dashed ? "4 4" : undefined,
    },
  };
}

function CommitNode({ data }: NodeProps) {
  const { commit, color, selected } = data as { commit: Commit; color: string; selected: boolean };
  return (
    <div
      className={`commit-node ${selected ? "selected" : ""}`}
      title={`${commit.sha} ${commit.subject}`}
    >
      <Handle type="target" position={Position.Left} className="h" />
      <span className="dot" style={{ background: color }} />
      {commit.refs.length > 0 && <span className="refs">{commit.refs[0]}</span>}
      <Handle type="source" position={Position.Right} className="h" />
    </div>
  );
}

function BranchNode({ data }: NodeProps) {
  const { branch, color, selected } = data as { branch: Branch; color: string; selected: boolean };
  return (
    <div className={`branch-node ${selected ? "selected" : ""}`}>
      <span className="swatch" style={{ background: color }} />
      <span className="branch-name" title={branch.name}>
        {branch.name}
      </span>
      {branch.current && <span className="tag">HEAD</span>}
      <span className="branch-meta">
        {branch.ahead ? `↑${branch.ahead} ` : ""}
        {branch.behind ? `↓${branch.behind} ` : ""}
        {ago(branch.lastCommitAt)}
      </span>
    </div>
  );
}

function WorktreeNode({ data }: NodeProps) {
  const { changed } = data as { changed: number };
  return (
    <div className="worktree-node">
      <Handle type="target" position={Position.Left} className="h" />
      Uncommitted · {changed} files
    </div>
  );
}

function SessionNode({ data }: NodeProps) {
  const { session, active } = data as { session: SessionSummary; active: boolean };
  return (
    <div className={`session-chip ${active ? "active" : ""}`} title={session.title}>
      <span className={`live-dot ${session.live ? "on" : ""}`} />
      <span className="chip-title" title={session.title}>
        {session.title}
      </span>
      <span className="chip-meta">
        {session.toolCount} tools · {compact(tokenSum(session.tokens))} tok
      </span>
    </div>
  );
}

const nodeTypes = {
  commit: CommitNode,
  branch: BranchNode,
  worktree: WorktreeNode,
  session: SessionNode,
};
