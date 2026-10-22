# Local setup

Quoli connects a local Git repository once and records automatic repository history while its collector runs. The repository layer works with any coding agent or editor. It does not claim to collect every agent's activity.

An [installable local CLI](cli.md) now supports `quoli connect --capture-code` from inside the target repository and manages the background production runtime. The source-checkout flow below remains available for development.

## Run and connect

From the source checkout:

```sh
pnpm dev
# In another terminal:
pnpm connect /path/to/project --name "Project" --capture-code
```

Use the same `TRACEFRAME_DATA_DIR` and collector-port overrides for both commands, if configured. Open http://127.0.0.1:3140 and select the project. No paid API, Claude login or agent configuration is required for repository history. See [automatic history](automatic-history.md) for sampling, Git observations and limits.

Without `--capture-code`, the project is metadata-only: code diffs and unstaged content edits are unavailable. Untracked files require the separate `--include-untracked` flag. Reconnecting preserves the existing policy; change consent in Settings. The connection writes only to Quoli's private local storage by default.

`pnpm connect` is the source-checkout entry point. The older setup script remains available as `pnpm run setup`; bare `pnpm setup` may invoke pnpm's own setup command instead.

## Optional Claude activity

```sh
pnpm connect /path/to/project --agent claude --capture-code
```

This additionally installs only Quoli's own hooks in `.claude/settings.json`, preserving other settings and hooks. Prompt/tool content remains disabled until explicitly enabled in Settings. The adapter was previously verified against Claude Code 2.1.306; see the [runtime report](claude-code-runtime-report.md). Codex, Pi and OpenCode activity integrations are not installed by this command.

Add `--telemetry` with `--agent claude` to print optional usage-export configuration. Existing destinations are reported and never replaced; no global settings are modified. Keep the printed local credential private. The [usage receiver](telemetry-receiver.md) documents the variables and source-level privacy gates. Reported usage requires the collector's project routing configuration as documented there.

## Check, pause, remove

```sh
pnpm connect /path/to/project --check
pnpm connect /path/to/project --disable
pnpm connect /path/to/project --undo PROJECT_ID
pnpm settings resume PROJECT_ID
```

Check reports registration, observer status and any installed Claude hooks. Disable pauses new capture and keeps retained evidence. Undo verifies that the project matches the registered root, removes its own installed Claude hooks if present, and deletes that project's retained evidence and observer registration. Source files, other hooks and global tool settings remain untouched. Deletion is not secure physical erasure and does not remove backups or agent-owned transcripts.

Quoli does not install a background service or a published global CLI. Port conflicts are reported instead of killing other software. The private data directory must be outside the observed repository. If capture is unavailable or blocked, inspect the repository-history status and Settings. Linux is the tested capture platform; macOS remains unverified.
