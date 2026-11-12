/** Topological lane assignment for a newest-first commit list (`git log --topo-order`). */

export interface LaneCommit {
  sha: string;
  parents: string[];
}

export interface Segment {
  lane: number;
  color: number;
}

export interface LaneRow {
  /** Lane (column) of the commit's dot. */
  col: number;
  color: number;
  /** Lanes that end at this commit from above; `lane !== col` draws a branch curve in. */
  into: Segment[];
  /** Lanes that run straight through the row. */
  pass: Segment[];
  /** Lines leaving the dot downward, to the lane their parent occupies. */
  out: Segment[];
}

export interface LaneLayout {
  rows: LaneRow[];
  /** Widest number of simultaneous lanes. */
  width: number;
}

export function assignLanes(commits: LaneCommit[], palette = 7): LaneLayout {
  // lanes[i] = sha the lane is waiting for (its next commit down), or null when free.
  const lanes: (string | null)[] = [];
  const colors: number[] = [];
  let nextColor = 0;
  let width = 1;
  const free = (): number => {
    let i = lanes.indexOf(null);
    if (i < 0) {
      i = lanes.length;
      lanes.push(null);
      colors.push(0);
    }
    colors[i] = nextColor++ % palette;
    return i;
  };
  const rows: LaneRow[] = [];

  for (const c of commits) {
    const waiting: number[] = [];
    lanes.forEach((s, i) => {
      if (s === c.sha) waiting.push(i);
    });
    const col = waiting.length ? waiting[0] : free();
    const color = colors[col];
    const row: LaneRow = { col, color, into: [], pass: [], out: [] };
    lanes.forEach((s, i) => {
      if (s !== null && s !== c.sha) row.pass.push({ lane: i, color: colors[i] });
    });
    for (const i of waiting) row.into.push({ lane: i, color: colors[i] });
    for (const i of waiting) lanes[i] = null;

    c.parents.forEach((p, k) => {
      let target = lanes.indexOf(p);
      if (target < 0) {
        // The first parent continues in the commit's own lane; others open a new lane.
        target = k === 0 ? col : free();
        if (k === 0) colors[col] = color;
        lanes[target] = p;
      }
      row.out.push({ lane: target, color: colors[target] });
    });
    width = Math.max(width, lanes.length, col + 1);
    // Trim free lanes on the right so later rows reuse the narrowest layout.
    while (lanes.length && lanes[lanes.length - 1] === null) {
      lanes.pop();
      colors.pop();
    }
    rows.push(row);
  }
  return { rows, width };
}

/** Shas reachable from `head` inside the listed commits (first-parent and merge parents). */
export function reachable(commits: LaneCommit[], head: string): Set<string> {
  const by = new Map(commits.map((c) => [c.sha, c]));
  const seen = new Set<string>();
  const stack = [head];
  while (stack.length) {
    const sha = stack.pop() as string;
    const c = by.get(sha);
    if (!c || seen.has(sha)) continue;
    seen.add(sha);
    stack.push(...c.parents);
  }
  return seen;
}
