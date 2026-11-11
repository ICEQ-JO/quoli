import type { Branch, Commit, GitState } from "../shared/model.ts";
import { git } from "./ingest.ts";

export function gitState(root: string): GitState {
  const branches: Branch[] = [];
  const refs = git(root, [
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname:short)%09%(objectname:short)%09%(upstream:short)%09%(upstream:track)%09%(committerdate:iso-strict)%09%(HEAD)",
    "refs/heads",
  ]);
  for (const line of (refs ?? "").split("\n")) {
    if (!line) continue;
    const [name, head, upstream, track, at, current] = line.split("\t");
    branches.push({
      name,
      head,
      upstream: upstream || null,
      ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
      behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
      lastCommitAt: at,
      current: current === "*",
    });
  }
  const commits: Commit[] = [];
  const log = git(root, [
    "log",
    "--branches",
    "--date-order",
    "-n",
    "120",
    "--format=%h%x09%p%x09%an%x09%aI%x09%D%x09%s",
  ]);
  for (const line of (log ?? "").split("\n")) {
    if (!line) continue;
    const [sha, parents, author, at, refs, ...subject] = line.split("\t");
    commits.push({
      sha,
      parents: parents ? parents.split(" ") : [],
      author,
      at,
      refs: refs
        ? refs
            .split(", ")
            .map((r) => r.replace(/^HEAD -> /, ""))
            .filter((r) => r !== "HEAD")
        : [],
      subject: subject.join("\t"),
    });
  }
  const changed = (git(root, ["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).length;
  return { branches, commits, changed };
}
