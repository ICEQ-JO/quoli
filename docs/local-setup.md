# Local setup

`pnpm setup` connects a local repository to Traceframe step by step. It never changes your global configuration, never replaces an existing telemetry destination and never hides a conflict.

## Before anything else: the fixture demo

The demo needs no Claude account and no network access:

```sh
pnpm demo
```

Open http://127.0.0.1:3140 and walk through the synthetic sessions first. The live connection below is optional and always explicit.

## Connect a repository

```sh
pnpm setup /path/to/project --name "Project" --capture-code
```

The setup reports the Claude Code and Git versions it found, registers the repository with explicit consent, and writes **only Traceframe's own hook entries** into that project's `.claude/settings.json`. Every other setting, hook group, status line and exporter in the file is preserved, and the number of preserved groups is reported.

Without `--capture-code` the project stays metadata-only, and the dashboard shows no code content.

## Report usage (optional)

Add `--telemetry` and the setup prints the variables to add to the environment that starts Claude Code:

```sh
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOGS_EXPORTER=otlp
export OTEL_METRICS_EXPORTER=none
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://127.0.0.1:4318/v1/logs
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <local credential>"
export TRACEFRAME_PROJECT_ID=<project id>
```

The setup prints the credential for you; it is the local one in your private data directory. It is never written into a project file and never committed.

If your user settings already contain telemetry variables, the setup **prints them and stops short of changing anything**: two exporters cannot share one destination, and the decision belongs to you.

## Check, disable, remove

```sh
pnpm setup /path/to/project --check     # what is installed, and what would conflict
pnpm setup /path/to/project --disable   # pause capture, keep the hooks and the evidence
pnpm setup /path/to/project --undo PROJECT_ID   # remove the hook entries and the retained evidence
pnpm settings rotate-credential         # revoke the local credential everywhere
```

Disabling stops new capture while the retained evidence stays readable. Undoing removes only Traceframe's own hook entries and the retained evidence of that project; your other hooks, your status line, your telemetry settings and your source files are untouched. Rotating the credential invalidates existing browser sessions and any bridge command that still carries the previous value, so re-run `pnpm bridge install` afterwards.

## Diagnostics

| State | What you see | What to do |
| --- | --- | --- |
| Claude Code not found | `Claude Code: not found on PATH` | Install Claude Code, or use the fixture demo. |
| Git not found | `Git: not found on PATH` | Install Git, or register a directory without version tracking. |
| Port already in use | The startup check reports the conflict | Stop the other process or set `TRACEFRAME_WEB_PORT` and `TRACEFRAME_COLLECTOR_PORT` for both the collector and the setup. |
| Collector unreachable | The bridge spools the observations | Start the collector, then run `pnpm bridge drain`. The spool depth is in the collector health endpoint. |
| Permissions on the data directory | The store cannot be opened | Keep the data directory private (mode 0700) and outside the observed repository. |
| Two telemetry destinations | The setup prints the existing values | Choose one destination, then re-run the setup with `--telemetry`. |
| An incompatible Claude Code version | The runtime report lists the tested version | Compare it with the [runtime verification report](claude-code-runtime-report.md); the values that differ stay unavailable rather than being guessed. |

## What the setup never does

It never installs a background service, never signs up for anything, never sends session data anywhere, never executes a recorded command, never writes to Git or to the index, and never modifies `~/.claude/settings.json`.

## Validation

`tests/setup.test.ts` covers the guided setup with a pre-existing hook and permissions, the check command, the reversible removal and the missing-directory diagnostic. The flow was exercised against Claude Code 2.1.306 in a disposable repository.
