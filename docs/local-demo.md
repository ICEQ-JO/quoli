# Local preview: synthetic session explorer

## What is implemented

The first usable increment runs a Next.js browser dashboard and one authenticated local collector. A SQLite event store persists three authored synthetic sessions. A separate [repository capture CLI](repository-capture.md) supports explicit real-project registration and read-only baselines/checkpoints. There is no live adapter, filesystem watcher, command runner, repository registration UI, cloud account, remote model, billing or outbound session upload.

The dashboard opens on Sessions: a grouped work list with title search, capture-state filtering, ordering and display controls. A session opens in Review, where you can read the captured request, available repository captures, ID-linked tool work, recorded verification evidence and unresolved evidence. Needs review is a separate source-linked inbox for recorded capture gaps. Project overview remains available as a secondary view. Inside each session, the dashboard supports selection, cursor-paginated timeline browsing, session-wide text search and type filters, receipt/source ordering, refreshable local evidence links, an evidence inspector, explicit tool-ID relationships, reported token/cache metrics and capture limitations. The source locator and normalized record are inspectable. Source-reported success does not prove feature correctness; referenced tool paths alone do not establish captured changes. The Changes tab separately compares stored snapshot pairs.

## Start and stop

Use the commands in the root [README](../README.md). Run commands from the repository root. `pnpm demo` starts both processes and imports the fixtures through authenticated collector ingestion. `pnpm dev` starts without seeding; on an empty store, run `pnpm seed` in another terminal before refreshing. Seeding is idempotent.

`Ctrl+C` shuts down both processes. Startup checks both ports first and reports conflicts rather than changing ports or stopping other software. Override ports explicitly if necessary:

```sh
TRACEFRAME_WEB_PORT=3141 TRACEFRAME_COLLECTOR_PORT=4319 pnpm demo
```

Use the displayed loopback URL. `pnpm smoke` checks an already-running default instance; use the same environment overrides when checking a custom instance.

## Five-minute review

- Start on **Overview**: the fixtures contain 3 sessions, 33 observations and 4 explicitly recorded capture gaps. Open **Sessions** to search by title or filter for sessions without a recorded end. These counts describe retained evidence, not capture completeness.
- Inspect the initial prompt in **Handle an empty cache response**. Select a tool request and follow **Open matching tool result**. The link is derived using `same-session-tool-id/v1`, not inferred from neighboring timestamps.
- Load the rest of the timeline. The fixture deliberately delivers one result late. Toggle source/receipt order to see the distinction. Search covers the entire retained session, including observations that have not been loaded into the list. Commands, Files, Prompts, Gaps and Usage filters also apply to the complete retained session.
- Inspect both reported test outcomes. The missing typecheck result remains a capture gap even though the source records an end to the session.
- Inspect **Verification evidence**: the failing run reports exit 1 with 1 failed and 4 passed, the later run reports exit 0 with 5 passed, and the typecheck reports a missing result. A path referenced after the failing run marks it as possibly stale. See [verification evidence](verification-evidence.md).
- Inspect **Usage**: non-cache input 3,100; output 1,560; cache read 30,500; cache write 2,400. The 84.7% cache-read token share uses a visible formula and is not a request hit rate. Open a usage observation to see its request identity.
- Inspect **Investigate a slow repository scan** for partial usage and a missing end; inspect **Content capture disabled** for retained metadata with omitted text.
- Open **Coverage** for explicit limitations. No screen claims complete capture, hidden reasoning or exclusive authorship.

## Navigation and small screens

**Review gaps** opens the explicit gap filter. Search this session finds retained matches beyond the first page; Load more paginates matching results. Changing search or filter resets the explicit evidence selection. The **Activity order** select orders all matches by receipt sequence or source timestamp, with stable pagination.

The evidence inspector puts captured content first and tucks source metadata into disclosures. **Copy evidence link** copies a local URL containing only IDs/view state. It does not upload evidence, and works only on the same running local workspace. A fresh local browser connection preserves validated project/session/view/event IDs through the credential-cookie redirect. When clipboard access is blocked, the address bar is the fallback.

On mobile, use the top **Overview** / **Sessions** navigation. Inside a review, switch sessions with the **Session** select. Select an activity to open **Evidence details**; the close button or Escape dismisses it and restores focus. Direct evidence links open this detail view automatically. Desktop tabs support Left/Right arrows and activity rows support Up/Down navigation.

## Storage and credentials

Linux defaults to `$XDG_DATA_HOME/traceframe/demo`, or `~/.local/share/traceframe/demo`. macOS defaults to `~/Library/Application Support/traceframe/demo`. `TRACEFRAME_DATA_DIR` overrides this directory; it must be private and outside the observed repository. The directory is mode 0700, and the database/credential are mode 0600. SQLite WAL/SHM files may exist while running.

The collector creates a random local credential on first setup; the browser never receives that credential. The Next server reads it from the private directory, authenticates collector reads, and establishes an HttpOnly SameSite=Strict local browser session. Host, Origin and Fetch Metadata checks reject cross-site access. This protects the local web boundary, not a machine already compromised by a same-user process.

The fixed synthetic project opts into fixture content. The shared policy defaults are metadata-only. The pipeline conservatively treats opaque prompt text as both prompt and code, and tool content as both tool output and code, including serialized nested objects. Both applicable controls must be enabled until finer classification is implemented. An excluded tool-call path suppresses its matching result. A result arriving before a matching call retains metadata only; a later retry does not restore omitted content. Path exclusions cannot establish the file origin of arbitrary shell output. This preview is not approved for importing personal agent transcripts.

Prompts, outputs and code are filtered/redacted in memory before persistence. Fields are bounded at 64 KiB (configurable through the policy), requests at 1 MiB and batches at 100 events. Demo retention is capped at 10,000 events / 50 MiB of encoded event content per project. Limits stop ingestion instead of silently deleting evidence. The full retention/deletion controls are planned in GitHub #13; do not treat this synthetic preview as a sensitive-data archive.

To test with a fresh store without deleting anything, set `TRACEFRAME_DATA_DIR` to a new private directory. To remove this preview's data, stop both services and remove only the dedicated demo directory you selected. That removes the demo database and credential; it does not delete Claude-owned source files, external backups or guarantee physical erasure. Never remove a shared parent directory.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Port busy | Stop your own previous demo or use both port overrides. Do not kill unrelated applications. |
| Collector unavailable | Check the terminal output, private data permissions and matching environment variables; use Refresh after recovery. |
| Session expired | Reload the page to establish a new local session. |
| No project on a fresh `pnpm dev` | Run `pnpm seed`, or restart with `pnpm demo`. |
| Invalid credential | Stop the demo, preserve the database, move aside only its credential file and restart; prior browser sessions become invalid. |
| Browser fixture tests report busy ports | Close an earlier test run; tests use 33140/34318 and an isolated store. |
| Build artifacts conflict | Dev, production, browser tests and lifecycle tests use separate `.next*` directories. Stop a prior instance using the same directory before restarting. |

## Current limitations

The authored demo is synthetic; explicit read-only repository capture is also supported through the CLI. Usage is a deterministic view of retained request observations, not an invoice or proof of complete collection. Ambiguous/conflicting usage returns null; there is no pricing engine. The Changes tab offers [captured before/after inspection](captured-changes.md); a change map remains upcoming. Session, view and selected evidence are encoded as IDs in a local URL and restored on reload. Search text is excluded from that URL. All dates and agent activities in the demo are authored examples. Desktop and a 390-pixel mobile viewport were checked on this Linux environment; other operating systems are not certified.

## Browser shows HTTP 431

Use `http://127.0.0.1:3140` (or your configured web port). Browser cookies are shared across ports on the same hostname; unrelated localhost applications can leave enough cookie data to exceed the server's header limit. The connection flow preserves `127.0.0.1` so it stays in a separate cookie namespace. HTTP 431 alone does not prove which header caused it.

If the IP address also returns 431, try a private browser window. Clearing site data for the affected hostname is optional and may sign you out of other apps on that hostname. Traceframe does not clear unrelated browser data or raise request header limits. A healthy `/api/health` request without browser cookies does not establish that a particular browser profile can load the dashboard.

## Session-first workflow

Open a session, read its Review document, then use Open changes to inspect captured versions. Recorded source opens evidence beside the document on desktop and in a native dialog on smaller screens. Escape/Close returns focus; the review stays selected. All sessions restores the in-memory list filters. Needs review opens a list/detail capture-gap queue; narrow screens provide Back to recorded gaps. The header theme control switches between verified dark and light palettes and saves only the theme preference locally. See [the workspace reference](design/session-workspace.md).
