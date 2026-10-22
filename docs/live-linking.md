# Live linking: from a live session to a captured change

A live Claude Code session and the repository captures of the same project can be read together: the session's tool activity, the captured before/after versions of the files and the checks that were recorded. The link is explicit and never claims authorship.

## The flow

1. **Register the repository** with explicit consent:

   ```sh
   pnpm repository register /path/to/project --name "Project" --capture-code
   ```

   Registration is metadata-only unless code capture is enabled. The project id is printed.

2. **Install the bridge** in that project:

   ```sh
   pnpm bridge install /path/to/project PROJECT_ID
   ```

   The hook command records the local data directory and the collector port, so install the bridge with the same `TRACEFRAME_DATA_DIR` and `TRACEFRAME_COLLECTOR_PORT` the collector uses.

3. **Work as usual.** The session's prompts, tool calls, results and lifecycle are recorded by the bridge.

4. **Capture the repository state** for that session:

   ```sh
   pnpm repository snapshot PROJECT_ID --session CLAUDE_SESSION_ID
   ```

   The first capture in a session is the baseline, every later one is a checkpoint. The session id is the Claude session id, which is visible in the session list of the dashboard. Captures are read-only: no Git write, no index change, no recorded command is executed.

5. **Read the result** in **Sessions → the live session**:
   - **Review** shows the recorded work and, in **Repository changes**, the captured versions.
   - **Changes** compares the baseline and the checkpoint.
   - **Map** joins the captured changes to the recorded checks.
   - **Source reconciliation** shows what the hook stream and the telemetry agree on.

## What the link does and does not say

- A recorded path is stored relative to the registered root, so a captured file and a referenced path describe the same file.
- A path referenced before a check is an **explicit reference**, not proof that the check covered the file, and never proof that the agent changed it.
- A dirty working tree, a concurrent user edit or a change made by a shell command stays visible: the capture records what the tree looked like, not who changed it.
- Edit and Write hooks do not cover shell rewrites or external tools, so the captured change can be wider than the recorded tool activity. The map never presents the tool activity as exhaustive.
- A missing baseline is unavailable, never an invented empty file. A capture that raced with a write is marked as such.

## Bounded and pausable

- Every capture re-checks the project's policy and the registered root, and refuses to run while capture is paused.
- The capture is bounded in file count, file size and total bytes; an omitted count is reported rather than silently dropped.
- The bridge never blocks the agent: a hook that cannot deliver spools the observation and retries later.

## Validation

`tests/controls.test.ts` covers the root-relative path storage and the pause check on capture. The flow was exercised end to end against Claude Code 2.1.306 in a disposable repository: a session edited a file, the baseline and checkpoint were captured for that session, and the map joined the captured change to the recorded command with its evidence and uncertainty.
