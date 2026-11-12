import type { ToolCall } from "../../../../shared/model.ts";

/** Runs shorter than this stay as individual rows. */
export const MIN_RUN = 3;

/**
 * Group consecutive calls of the same agent, tool and category. Failed and
 * subagent-launch calls never join a run: they must stay individually visible.
 */
export function collapseRuns(calls: ToolCall[], minRun = MIN_RUN): ToolCall[][] {
  const groups: ToolCall[][] = [];
  const same = (a: ToolCall, b: ToolCall) =>
    a.agentId === b.agentId && a.name === b.name && a.category === b.category;
  const joinable = (c: ToolCall) => c.status !== "failed" && c.category !== "agent";
  let run: ToolCall[] = [];
  const flush = () => {
    if (run.length >= minRun) groups.push(run);
    else for (const c of run) groups.push([c]);
    run = [];
  };
  for (const c of calls) {
    const head = run[0];
    if (head && joinable(c) && same(head, c)) {
      run.push(c);
    } else {
      flush();
      if (joinable(c)) run = [c];
      else groups.push([c]);
    }
  }
  flush();
  return groups;
}

/** Longest shared directory prefix of repo-relative paths ("" when there is none). */
export function commonPrefix(paths: string[]): string {
  const first = paths[0]?.split("/").slice(0, -1);
  if (!first) return "";
  let n = first.length;
  for (const p of paths) {
    const s = p.split("/").slice(0, -1);
    let i = 0;
    while (i < n && i < s.length && s[i] === first[i]) i++;
    n = i;
  }
  return first.slice(0, n).join("/");
}

/** "Read × 14 · packages/admin/src/…" */
export function runLabel(run: ToolCall[]): string {
  const name = (run[0]?.name ?? "").replace(/^mcp__/, "");
  const files = run.flatMap((c) => c.files);
  const prefix = files.length === run.length ? commonPrefix(files) : "";
  return `${name} × ${run.length}${prefix ? ` · ${prefix}/…` : ""}`;
}

/** The Graph view fits everything when small, else only the most recent calls. */
export const GRAPH_FIT_ALL = 25;
export const GRAPH_RECENT = 8;
/** Sessions up to this many calls open on the Timeline, larger ones on the Graph. */
export const TIMELINE_MAX = 60;
