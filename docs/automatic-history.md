# Automatic repository history

Quoli observes a connected local Git repository while its collector runs. Observation is independent of a coding agent: changes from Claude Code, Codex, Pi, OpenCode, an editor or a shell are all eligible repository changes. That does **not** collect those tools' internal sessions or establish who made an edit.

## Connect once

From the Quoli source checkout:

```sh
pnpm dev
# In a second terminal, using the same data-directory/port overrides if any:
pnpm connect /absolute/path/to/project --capture-code
```

Open http://127.0.0.1:3140, select the project, and open **Repository history** from Sessions. A fresh workspace selects the first registered project automatically. The real-project session list and repository-history review refresh in place without reloading the document.

The connection command enables automatic observation in private local configuration. It does not modify the repository, install agent hooks, run an agent, or install a background OS service. Keep Quoli running to capture changes. Stop it normally to stop observation. There is no published installer/package yet. An [unpublished local CLI release](cli.md) can now be built and installed once; `quoli connect --capture-code` then connects from inside a target repository and starts background capture. The source-checkout path above remains available.

`--capture-code` explicitly permits bounded, best-effort-redacted code versions. Without it, capture is metadata-only: file bodies and unstaged content edits are unavailable. `--include-untracked` separately permits untracked-file capture. Ignored/excluded paths are omitted. Existing project consent is never silently broadened by reconnecting: use Settings to change it.

For optional Claude session activity, add `--agent claude` during connection; see [setup](local-setup.md). Codex, Pi and OpenCode activity adapters remain planned. They require their own supported contracts and fixtures, not Claude-shaped guesses.

## What is recorded

- A bounded initial working-tree baseline, followed by a checkpoint when the retained sanitized observation changes.
- Observed HEAD and branch (null for detached/unknown branch), with observation time, provenance and capture limits.
- Up to 100 newly reachable commit IDs between sampled forward HEADs. Existing history is not imported on first connection; messages and author emails are not collected. Excess IDs are explicitly omitted.
- A non-forward HEAD transition is marked diverged; unavailable continuity stays unknown. Branch changes can be observed without implying a new commit.

Daily UTC repository-history entries are separate from agent sessions. Open captured diffs to use the existing version comparator. Repository Activity retains source records; the review shows the latest 50 Git-state observations and directs you to Activity for older ones.

## Sampling and controls

The collector scans sequentially, then waits five seconds; slow captures make the interval longer. At most 50 repositories can opt in. Each capture has the existing 1,000-file, per-file and total-byte bounds. This is sampled history: rapid intermediate edits, commits no longer reachable from a sampled HEAD, and work while Quoli is stopped can be missed. It is not a filesystem journal or a complete Git audit trail. A capture is not atomic; detectable HEAD/index/file races remain explicit.

Only changed sanitized samples are saved, including across observer restarts. Raw content hashes are not persisted to detect disabled or excluded code changes. Metadata-only mode cannot detect arbitrary unstaged edits. Missing data is not reconstructed from Git HEAD.

Settings pause applies before persistence, and deletion removes observer registration and fences stale work. Every save rechecks policy, registration epoch and pause state. Retention is applied during observation. At the storage quota, capture reports **blocked** and preserves retained evidence. An unsafe/missing root reports **unavailable** and is retried. The status endpoint never exposes registered roots or Git stderr.

The safe reader keeps the existing Linux `/proc/self/fd` boundary; unsupported file-capture platforms fail closed. No Git writes, content filters, repository hooks, fetches, recorded commands or source code are executed by Quoli.

## Compatibility and local work

Quoli is the product name. Existing `@traceframe/*` internal packages, `TRACEFRAME_*` variables, SQLite filenames, browser keys and private storage paths are retained to avoid an unrelated migration. This increment lives only on `feat/quoli-automatic-repository-history`; its [local work record](work/automatic-repository-history.md) tracks acceptance and validation. Nothing has been pushed.
