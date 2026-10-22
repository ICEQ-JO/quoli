# Local repository capture

Repository capture is a separate, explicit operation from collecting agent activity. A working-tree snapshot records what was observed at a particular point; it cannot establish who changed a file. An already-dirty working tree is a valid baseline. HEAD is context, not a substitute for that baseline.

## Register and capture

From the Traceframe repository:

```sh
pnpm repository register /absolute/path/to/repository --name "My project"
pnpm repository list
pnpm repository snapshot PROJECT_ID --session manual-review
```

Registration defaults to metadata-only. Add `--capture-code` during registration to enable code content with best-effort redaction. Untracked files require the separate `--include-untracked` flag. Ignored/excluded content remains omitted. Prompt and tool-output capture are not enabled by this operation.

Use the same session ID for the baseline and subsequent checkpoint. Use a new session ID for a separate review. The first snapshot in a review is marked baseline; later ones are checkpoints. A missing baseline is never reconstructed from HEAD.

```sh
pnpm repository register /absolute/path/to/repository --name "My project" --capture-code --include-untracked
pnpm repository snapshot PROJECT_ID --session review-example
# Make an intentional change yourself in your editor, then capture again:
pnpm repository snapshot PROJECT_ID --session review-example
```

No recorded commands are executed. Registration and capture do not install a watcher, connect Claude, stage files, alter the index, or restore versions. The local collector/browser can stay running while the CLI writes to the private SQLite store; refresh the dashboard to see new observations.

## Persistence and limitations

The registered absolute root stays in private local storage and is not part of a public snapshot payload. Captured file paths are repository-relative and redacted. Code, when enabled, is sanitized before persistence and fingerprinted only after sanitization. Dirty state is null when uncaptured content prevents establishing whether the working tree is clean. Unknown or unsupported content is represented explicitly.

A snapshot and its append-only event-history marker commit in one transaction. Project quotas count snapshot bodies together with event and artifact storage. Duplicate identities cannot overwrite accepted observations. Binary, excluded, oversized, symlink, submodule and unavailable content must not be treated as ordinary empty files.

Working-tree observations are not atomic filesystem snapshots. HEAD/index movement and detectable read races are marked; overlapping activity prevents exclusive attribution. Redaction reduces risk and cannot guarantee removal of all secrets. Retention/deletion controls and live collection remain separate planned increments.

## Supported safety boundary and validation

File capture currently supports Linux with `/proc/self/fd`. Each directory is held open while its child is opened with no symlink following; unsupported platforms fail closed for file observations. Git is resolved outside the observed repository and used only for HEAD/index/name metadata. Dirty-state comparison hashes already-read bytes in memory against index object identities; the raw comparison hash is discarded. No working-tree Git status/diff or content filter is executed. Raw-byte comparison may differ from Git's normalized-content view in repositories using CRLF conversion or clean filters.

Temporary-repository tests cover staged/unstaged/untracked and dirty baselines, unborn/moved HEAD, ignored/excluded and hostile/non-UTF-8 names, binary/oversized/deleted content, submodules and linked worktrees, missing/repository-local Git executables, disabled filters/hooks/fsmonitor, index preservation, limits and metadata-only consent. Deterministic descriptor tests swap an ancestor to an outside symlink and mutate a file during its read. CLI and storage checks cover registration, baseline/checkpoint persistence, project isolation, rollback, quota and sanitized summary paging. Browser checks select a real disposable repository and verify that it is not labeled synthetic and that summary responses expose neither roots nor code. These tests do not make filesystem observations atomic.
