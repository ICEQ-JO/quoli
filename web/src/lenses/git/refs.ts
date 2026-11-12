/**
 * Commit decorations as people read them. Git lists a local branch and its remote-tracking copy
 * separately (`main`, `origin/main`); when both point at the same commit they are one tag that
 * says "pushed". `origin/HEAD` is a pointer to the remote's default branch and is dropped.
 */
export type RefKind = "local" | "remote" | "synced" | "tag";

export interface RefTag {
  /** Branch or tag name without the remote prefix (for remote-only refs, with it). */
  name: string;
  kind: RefKind;
  /** Remote names the branch matches on this commit, e.g. ["origin"]. */
  remotes: string[];
  current: boolean;
}

export function mergeRefs(refs: string[], remotes: string[], current: string | null): RefTag[] {
  const out: RefTag[] = [];
  const locals = new Map<string, RefTag>();
  const remoteRefs: { remote: string; branch: string; raw: string }[] = [];
  for (const raw of refs) {
    if (raw.startsWith("tag: ")) {
      out.push({ name: raw.slice(5), kind: "tag", remotes: [], current: false });
      continue;
    }
    const remote = remotes.find((r) => raw.startsWith(`${r}/`));
    if (remote) {
      const branch = raw.slice(remote.length + 1);
      if (branch !== "HEAD") remoteRefs.push({ remote, branch, raw });
      continue;
    }
    const tag: RefTag = { name: raw, kind: "local", remotes: [], current: raw === current };
    locals.set(raw, tag);
    out.push(tag);
  }
  for (const r of remoteRefs) {
    const local = locals.get(r.branch);
    if (local) {
      local.kind = "synced";
      local.remotes.push(r.remote);
    } else {
      out.push({ name: r.raw, kind: "remote", remotes: [r.remote], current: false });
    }
  }
  // Current branch first, then local and synced branches, remote-only refs, tags.
  const rank: Record<RefKind, number> = { synced: 1, local: 1, remote: 2, tag: 3 };
  return out.sort((a, b) => Number(b.current) - Number(a.current) || rank[a.kind] - rank[b.kind]);
}

export function refTitle(t: RefTag): string {
  if (t.kind === "tag") return `Tag ${t.name}`;
  if (t.kind === "remote")
    return `${t.name}: remote-tracking branch, as of the last fetch. No local branch points here.`;
  if (t.kind === "synced")
    return `${t.name}: local branch; ${t.remotes.map((r) => `${r}/${t.name}`).join(", ")} points at the same commit (pushed)`;
  return `${t.name}: local branch${t.current ? ", checked out" : ""}; not on a remote at this commit`;
}
