/** A row of `team_live` (supabase/migrations/20261115180000_team_live.sql, #25). */
export interface LiveRow {
  user_id: string;
  member: string | null;
  agent: string;
  model: string | null;
  repo: string | null;
  branch: string | null;
  started_at: string;
  updated_at: string;
  usd: number | string | null;
  calls: number;
  failures: number;
}

export interface Overlap {
  repo: string;
  /** Set when everyone listed is on this branch. */
  branch: string | null;
  members: string[];
}

/**
 * Different members with live agents on the same GitHub repository: on the same branch first
 * (their changes meet directly), then the same repository on different branches. A member's own
 * agents never overlap with each other here; the local Quoli warns about those (#17).
 */
export function overlaps(rows: LiveRow[]): Overlap[] {
  const name = (r: LiveRow) => r.member ?? "member";
  const people = (list: LiveRow[]) => [...new Set(list.map(name))].sort();
  const byRepo = new Map<string, LiveRow[]>();
  for (const r of rows) if (r.repo) byRepo.set(r.repo, [...(byRepo.get(r.repo) ?? []), r]);
  const out: Overlap[] = [];
  for (const [repo, list] of byRepo) {
    if (new Set(list.map((r) => r.user_id)).size < 2) continue;
    const byBranch = new Map<string, LiveRow[]>();
    for (const r of list)
      if (r.branch) byBranch.set(r.branch, [...(byBranch.get(r.branch) ?? []), r]);
    const shared = [...byBranch].filter(([, l]) => new Set(l.map((r) => r.user_id)).size > 1);
    for (const [branch, l] of shared) out.push({ repo, branch, members: people(l) });
    if (!shared.length) out.push({ repo, branch: null, members: people(list) });
  }
  return out.sort(
    (a, b) => Number(!!b.branch) - Number(!!a.branch) || a.repo.localeCompare(b.repo),
  );
}
