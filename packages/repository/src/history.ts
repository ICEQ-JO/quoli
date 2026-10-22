import type { NormalizedEvent } from "@traceframe/schema";
import { redact } from "@traceframe/schema/privacy";
import { createGitRunner } from "./git";

type RepositoryState = Extract<NormalizedEvent["payload"], { kind: "repository_state" }>;
const commitId = /^[a-f0-9]{40,64}$/;

/** Local Git graph metadata only: no message, author, hook, filter or network. */
export async function readRepositoryHistory(
  root: string,
  head: string | null,
  previousHead: string | null,
  initial: boolean,
): Promise<RepositoryState> {
  const git = createGitRunner(root, [
    ["core.fsmonitor", "false"],
    ["core.hooksPath", "/dev/null"],
  ]);
  const branchResult = await git.optional(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const branch =
    branchResult === null ? null : redact(branchResult.toString("utf8").trim()).slice(0, 1024);
  const result: RepositoryState = {
    kind: "repository_state",
    head,
    previousHead,
    branch,
    transition: initial ? "initial" : "unchanged",
    commits: [],
    omitted: false,
  };
  const observed = await git.optional(["rev-parse", "--verify", "--quiet", "HEAD"]);
  const currentHead = observed === null ? null : observed.toString("utf8").trim();
  if (currentHead !== head) return { ...result, transition: "unavailable" };
  if (initial || head === previousHead) return result;
  if (!head || !commitId.test(head) || (previousHead !== null && !commitId.test(previousHead)))
    return { ...result, transition: "unavailable" };
  if (previousHead) {
    const ancestor = await git.run(["merge-base", "--is-ancestor", previousHead, head]);
    if (!ancestor.ok) {
      // Non-ancestry, missing/pruned objects and a failed query cannot establish
      // a forward history. Do not import the target branch's historical commits.
      const old = await git.optional(["rev-parse", "--verify", `${previousHead}^{commit}`]);
      return {
        ...result,
        transition: old === null || ancestor.failure !== "exit" ? "unavailable" : "diverged",
      };
    }
  }
  const listed = await git.optional([
    "rev-list",
    "--max-count=101",
    head,
    ...(previousHead ? [`^${previousHead}`] : []),
    "--",
  ]);
  if (listed === null) return { ...result, transition: "unavailable" };
  const commits = listed
    .toString("utf8")
    .trim()
    .split("\n")
    .filter((id) => commitId.test(id));
  return {
    ...result,
    transition: "fast_forward",
    commits: commits.slice(0, 100),
    omitted: commits.length > 100,
  };
}
