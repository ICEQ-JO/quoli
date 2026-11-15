# AI multiplayer: several agents, several people

Status (2026-11-15): **paused by the owner.** Two parts are delivered and documented below; the rest of #18 is not planned for now. Technical details: [architecture.md](architecture.md) (`server/collisions.ts`) and [teams.md](teams.md) (Working now).

## 1. On one computer: "Agents on the same files" (#17)

For running several agents at once: two terminals, two agents, or separate worktrees.

- Quoli compares the files each session edited (as the agents reported them) for sessions in the same repository in the last day. Worktrees of one repository count as one project.
- Two sessions collide when they edited the same files **and** either ran at the same time, or are on two branches not yet merged into each other.
- For two branches, Git predicts whether merging their committed work will conflict, and in which files (`git merge-tree`, Git 2.38+). This is a prediction, not a guarantee.
- Shown on the Dashboard as **Agents on the same files**, live sessions first, each linking to the session's board. Nothing leaves the computer.

Try it: two agents in one recorded repository, both asked to edit the same file.

Limits: edits made only through shell commands are not seen; uncommitted work in two worktrees is compared by file, not by conflict; sessions on one branch that ran one after the other are not flagged.

## 2. Across a team: "Working now" (#25)

For several people, each running agents on their own computer, in one team on [iceq.best/app](https://iceq.best/app/).

- Each team page shows who has an agent working right now: person, agent, model, GitHub repository, branch, start time, spend so far and failed calls. It refreshes every 30 seconds.
- When different people work in the same repository it says so, more strongly on the same branch.
- Uses only the session summaries Team sync already sends (re-sent every minute while a session has activity). Prompts, code, commands and file names never leave a computer.
- The team owner always sees it; members only when the owner turns on **Members see this too** (off by default).

Try it: two accounts in one team, both connected (`npx https://iceq.best/quoli.tgz connect`), agents working in the same GitHub repository.

Limits: an agent waiting for its user drops out after 5 minutes without activity; repositories without a GitHub remote show no name and are never compared; the overlap is per repository and branch, not per file or folder.

## Not built (deferred from #18)

- Sharing one session with the team as a revocable review link, with a preview of what is uploaded.
- Per-member trends over time (activity, failures, spend) in the class view.
- Opt-in sharing of top-level folder names, to detect overlap within a repository across people.
