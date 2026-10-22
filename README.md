# Traceframe

A local evidence workbench for AI-assisted development. Repository: `ICEQ-JO/quoli`.

> Show me what my coding agent did, what changed, and what remains unverified.

The first usable preview is available: **a synthetic session explorer** with a persistent timeline, tool results, evidence links, reported token/cache usage and explicit capture gaps. Explicit read-only repository capture is available through the [capture CLI](docs/repository-capture.md). The dashboard now compares captured before/after versions with source links and explicit unavailable sides. Live Claude Code collection and the change map are still upcoming.

## Run the demo

Requires Node **24.16+ within Node 24** and pnpm **11.12.0**. Linux is tested; macOS is not yet certified. A browser-test dependency is not needed to run the app.

```sh
pnpm install --frozen-lockfile
pnpm demo
```

Open **http://127.0.0.1:3140**. Stop both services with **Ctrl+C**. The collector binds to `127.0.0.1:4318`. Neither server is publicly exposed. No API key or Claude account is needed; no agent is connected and no recorded commands are executed.

The demo imports 33 entirely synthetic observations across three sessions. Re-running it preserves your local data and does not duplicate those observations.

## Try these flows

1. Start on **Overview**, then open **Explore a session** or choose **Handle an empty cache response** from **Sessions**. In the session, select a tool request, then follow its derived link to the matching result.
2. **Load more** to inspect the reported test failure, later success and missing typecheck result. Compare receipt order with source time.
3. Open **Usage** to inspect the four token categories and the formula behind the cache-read token share.
4. Switch to **Investigate a slow repository scan**: missing usage remains unknown and the session is incomplete.
5. Switch to **Content capture disabled**, then open **Coverage** to review what the preview cannot establish.
6. Return to **Overview** for the recorded capture-gap queue, or search/filter the **Sessions** library. Use **Review gaps**, search the entire session, or copy an evidence link from the inspector. Session, view and evidence selection survive reload.

Read the [demo and troubleshooting guide](docs/local-demo.md), [development/API reference](docs/development.md), [product plan](docs/README.md), [architecture](docs/architecture.md), [GitHub backlog](docs/issues/README.md), and [working agreements](AGENTS.md).

All session evidence stays on your machine. Synthetic content is explicitly enabled for the fixed demo project; new real projects default to metadata-only capture in the shared policy contract. Real-project registration is not exposed yet. Redaction reduces risk and cannot guarantee removal of every secret.
