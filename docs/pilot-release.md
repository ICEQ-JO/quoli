# Pilot release

The MVP pilot is the local application in this repository, used by one developer on one machine, with one local Git repository per project and Claude Code as the only live agent. This page records the release checklist, the coverage and privacy guarantees, the limits of what is captured, and how to run the pilot validation.

## Run the pilot validation

```sh
pnpm pilot
```

The script is fixture-only: no Claude account, no network call, no paid API. It walks the whole local flow in a disposable store and prints a pass/fail line per check, followed by the baseline timing and memory.

Last recorded run on the development machine (Linux x64, Node 24.16, Claude Code 2.1.306):

```
14/14 checks passed.
Baseline: 81 ms for the whole run, 0.3 ms for 4 pages, 110592 bytes of pilot store.
```

The bounded history check stores 10,000 observations and pages through them eight at a time, so the whole history is never loaded at once. The map caps hold at 100 nodes and 200 edges with explicit omission counts.

## Release checklist

- [ ] `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.
- [ ] `pnpm test:e2e` passes with the browser flows.
- [ ] `pnpm pilot` passes every check.
- [ ] `pnpm demo` opens the workspace and the synthetic sessions read as documented.
- [ ] The [runtime verification report](claude-code-runtime-report.md) matches the Claude Code version installed on the pilot machine, or the differences are recorded.
- [ ] The local data directory is private (mode 0700), outside the observed repository, and the credential file is mode 0600.
- [ ] The capture policy of the pilot project is what the developer expects, and the policy preview matches it.
- [ ] Deletion was exercised on a disposable project: the evidence is gone, capture is stopped, and the source repository is untouched.

## What the pilot covers

| Flow | Where |
| --- | --- |
| Prompt, tool and lifecycle observations | [hook bridge](hook-bridge.md) |
| Reported usage with honest gaps | [reported usage receiver](telemetry-receiver.md) |
| Before/after file versions | [captured file review](captured-changes.md) |
| Evidence-backed checks | [verification evidence](verification-evidence.md) |
| Bounded change map | [change map](change-map.md) |
| Cross-source reconciliation | [source reconciliation](source-reconciliation.md) |
| Capture controls, retention, deletion | [capture controls](lifecycle-controls.md) |
| Guided setup and removal | [local setup](local-setup.md) |

## Privacy guarantees

- All session evidence stays on the machine. Nothing is uploaded, and there is no telemetry reporter, analytics or font fetch at runtime.
- Prompts, tool output and code are redacted and bounded **before** persistence, and the policy that is active at delivery time is re-checked.
- Personal attributes that arrive in the telemetry stream are dropped before anything is stored.
- The bridge is passive: it never blocks the agent, never runs a recorded command and never answers on stdout.
- Deletion removes the retained evidence of a project, truncates the local write-ahead log and stops capture. It is not a secure physical erasure: freed database pages, external backups, your source repository and the agent's own transcripts are outside Traceframe's reach.
- The credential is local, never a URL parameter and never written into a project file.

## Coverage and known gaps

- The capture is incomplete by design. Edit and Write hooks do not cover shell rewrites or external tools, so a captured change can be wider than the recorded tool activity.
- A referenced path is never presented as authorship, and reference order is never presented as test coverage.
- A missing result is a gap, not a failure. An interrupted session stays open.
- The hook payload carries no timestamp and no numeric exit code, so both stay unknown.
- Reported usage is the source's own request series. Counters, status samples and duplicated exports are never added to it.
- The demo and the fixtures are authored examples. They are not evidence about any real project.

## Restore and backup limits

The local store is the primary record and the derived views are recomputed from it. A backup of the private data directory can be restored into a new store, but:

- the store is only one part of the evidence: the spool, the credential and the registered repositories live in the same directory, and the credential is not portable;
- restoring an older backup brings back older observations, and any deletion performed after that backup is undone with it;
- the derived views are recomputed, so a restored store is not expected to reproduce the exact view state of the original, only the same observations;
- a backup of the data directory is a copy of session evidence and deserves the same protection as the evidence itself.

## What is not automated

The live walkthrough needs the developer's own Claude Code access and was performed in a disposable repository during the runtime gate. A fresh-machine pilot, a macOS run and an offline run are the owner's checks to repeat; the tooling supports them, but this repository does not claim them as verified.

## No automatic release

Nothing in this repository publishes, uploads, tags or deploys. A release is an explicit human action, and the PR stack stays open until the owner merges it.
