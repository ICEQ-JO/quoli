# Quoli

A local evidence workbench for AI-assisted development. Repository: `ICEQ-JO/quoli`.

> Show me what my coding agent did, what changed, and what remains unverified.

The local MVP is available: **a session review workspace** with a persistent timeline, tool results, evidence links, reported token/cache usage, recorded verification evidence, a bounded change map, cross-source reconciliation and explicit capture gaps. Explicit read-only repository capture is available through the [capture CLI](docs/repository-capture.md), and local capture controls, retention and project deletion through the [settings view](docs/lifecycle-controls.md) and `pnpm settings`. The dashboard opens on a grouped session work list, with a focused review page, a recorded-gap inbox, captured before/after inspection and a map that joins captures to recorded checks. See the [workspace guide](docs/design/session-workspace.md).

Live Claude Code collection is implemented as a passive [hook bridge](docs/hook-bridge.md) and a narrow [reported usage receiver](docs/telemetry-receiver.md), verified against Claude Code 2.1.306 in the [runtime report](docs/claude-code-runtime-report.md). The [setup guide](docs/local-setup.md) connects and removes the integration, and the [pilot checklist](docs/pilot-release.md) records what the local MVP guarantees and what it does not.

## Install a local CLI

`pnpm release:local` builds a standalone local Linux archive. Run `node dist/quoli/cli.mjs install` once, then run `quoli connect --capture-code` inside your repository. Capture and the production dashboard run in the background, managed with `quoli start`, `quoli stop` and `quoli status`. Node 24.16+ within Node 24 and Git are required; the installed runtime needs neither pnpm nor this checkout. Nothing is published to a registry. See [CLI installation and lifecycle](docs/cli.md).

## Connect your repository

From this source checkout, start `pnpm dev`, then run `pnpm connect /path/to/repo --capture-code` in another terminal. Quoli automatically samples file versions, branch/HEAD changes and bounded commit IDs while running, regardless of the agent or editor used. Open the project's **Repository history** to review captured diffs. Code capture is explicit; metadata-only is the default. Untracked capture needs separate consent.

The [automatic-history guide](docs/automatic-history.md) explains setup and sampling limits. This repository layer does not identify authorship or collect Codex/Pi/OpenCode session internals; detailed Claude activity remains an optional integration. No package or installer has been published. Internal `TRACEFRAME_*` configuration and storage paths remain compatible with earlier local data.

## Run the demo

Requires Node **24.16+ within Node 24** and pnpm **11.12.0**. Linux is tested; macOS is not yet certified. A browser-test dependency is not needed to run the app.

```sh
pnpm install --frozen-lockfile
pnpm demo
```

Open **http://127.0.0.1:3140**. Stop both services with **Ctrl+C**. The collector binds to `127.0.0.1:4318`. Neither server is publicly exposed. No API key or Claude account is needed; no agent is connected and no recorded commands are executed.

The demo imports 33 entirely synthetic observations across three sessions. Re-running it preserves your local data and does not duplicate those observations. Run `pnpm pilot` for the fixture-only validation of the whole local flow.

## Try these flows

1. Start on **Overview**, then open **Explore a session** or choose **Handle an empty cache response** from **Sessions**. In the session, select a tool request, then follow its derived link to the matching result.
2. **Load more** to inspect the reported test failure, later success and missing typecheck result. Compare receipt order with source time.
3. Open **Usage** to inspect the four token categories and the formula behind the cache-read token share.
4. Switch to **Investigate a slow repository scan**: missing usage remains unknown and the session is incomplete.
5. Switch to **Content capture disabled**, then open **Coverage** to review what the preview cannot establish.
6. Open **Map** to see the captured changes joined to the recorded checks, then open **Verification evidence** for the recorded failure, pass and missing result.
7. Open **Settings** to change the capture policy, pause capture, set a retention window or delete the project's evidence.
8. Return to **Overview** for the recorded capture-gap queue, or search/filter the **Sessions** library. Use **Review gaps**, search the entire session, or copy an evidence link from the inspector. Session, view and evidence selection survive reload.

Read the [demo and troubleshooting guide](docs/local-demo.md), [verification evidence](docs/verification-evidence.md), [change map](docs/change-map.md), [capture controls](docs/lifecycle-controls.md), [local setup](docs/local-setup.md), [pilot checklist](docs/pilot-release.md), [development/API reference](docs/development.md), [product plan](docs/README.md), [architecture](docs/architecture.md), [GitHub backlog](docs/issues/README.md), and [working agreements](AGENTS.md).

All session evidence stays on your machine. Synthetic content is explicitly enabled for the fixed demo project; new real projects default to metadata-only capture in the shared policy contract. Real-project registration is not exposed yet. Redaction reduces risk and cannot guarantee removal of every secret.
