# Capture controls, retention and deletion

Open **Settings** in the workspace sidebar, or use the `pnpm settings` CLI. These are the local lifecycle controls for one project: what is captured, whether capture runs, how long evidence is kept, and how to remove it.

## Capture policy

Three independent controls decide what the collector may persist: prompts, tool output and code. The collector applies changes **before** new database content is written, so the next accepted observation is sanitized under the new policy. History already retained is not rewritten; delete it explicitly if you want it gone.

Tool output may contain code in any nested position, so tool and code consent are both required before any content is stored. Enabling code capture therefore enables tool capture. Excluded paths (`node_modules`, `.git`, `.env`, …) stay configured regardless of the toggles.

The bridge has a durable retry spool. Before an undelivered observation is written, the bridge reads the project's current policy and capture state from the local store in read-only mode and applies the same sanitization the collector would: content classes the policy disables are stored as metadata with no text, and excluded paths lose both their path and content. When the policy cannot be read (store not created yet, unreadable database, unregistered project) the observation is kept as metadata with an `unavailable` content state instead of text. A paused or deleted project is not spooled at all, so resuming or re-registering cannot resurrect observations captured while capture was stopped.

Known limits: a retry written earlier under a more permissive policy is not rewritten when the policy tightens; the collector revalidates it on delivery, and the V03 lifecycle increment coordinates spool cleanup with purge. Deletion still does not remove retry entries written before the deletion; `docs/issues/vision/v03.md` tracks that repair. Collector-side sanitization does not undo earlier spool writes. These controls describe local database and retry behavior, not complete spool or cloud deletion guarantees.

## Capture state

Pausing stops new observations for the project. Retained evidence stays readable, and resuming continues with the current policy. A paused project rejects ingestion instead of silently dropping data.

## Retention

A retention window removes observations and repository captures older than the window. It is applied when the window changes and when new observations arrive. Derived views are rebuilt from what remains, so removed evidence never keeps a factual claim alive: a deleted result simply stops existing, and the relationships, checks, usage and change map are recomputed from the retained record.

In Settings, selecting a new window stages the change. **Apply retention** explains that expired evidence is deleted immediately and cannot be recovered; **Cancel retention change** restores the last confirmed value. Policy and pause controls save immediately and report success or failure.

## Deletion

Deleting a project removes its observations, repository captures, artifacts and registration, truncates the local write-ahead log and stops capture and storage for it. A tombstone then rejects stale producers and in-flight retries for that project. Re-registering the project explicitly is an owner action that clears the tombstone and resumes capture.

After a successful dashboard deletion, a terminal result shows the actual removed counts and offers a return to Sessions; stale policy and retention controls are no longer shown.

Deletion is idempotent: an interrupted or repeated deletion reports the same result and removes nothing twice.

Deletion is **not** secure physical erasure. Freed database pages, external backups, your source repository, the agent's own transcripts and anything outside Quoli are untouched. The settings view states exactly this before you confirm.

## Commands

```sh
pnpm settings list
pnpm settings show PROJECT_ID
pnpm settings policy PROJECT_ID --code --no-prompt
pnpm settings pause PROJECT_ID
pnpm settings resume PROJECT_ID
pnpm settings retention PROJECT_ID --days 30   # --days 0 keeps everything
pnpm settings usage PROJECT_ID
pnpm settings purge PROJECT_ID --confirm
```

The CLI and the dashboard act on the same local store. Deletion requires `--confirm` in the CLI and an explicit confirmation in the dashboard.

## Bounds and API

`GET /v1/projects/:project/settings` returns the policy, capture state, retention window and storage usage. `POST /v1/projects/:project/settings` updates the policy, the pause state or the retention window. `POST /v1/projects/:project/purge` deletes the project and reports the removed counts. All three require the local collector credential; the browser reaches them through the protected `/api/settings` proxy with the same local session cookie as the rest of the dashboard.

Storage usage counts observations, captures and artifacts with their encoded size. Removed content is never logged.

## Validation

`tests/controls.test.ts` covers policy-before-persistence, paused capture, retention with dependent evidence, deletion that blocks stale producers, idempotent deletion after an interruption and the cleared write-ahead log. `tests/bridge.test.ts` runs the real hook subprocess against an unreachable collector and covers default-policy silence, explicitly permitted capture, nested code requiring both tool and code consent, excluded paths, paused projects, an unreadable policy and malformed or oversized stdin. The browser suite covers the settings view, the pause/resume control, the retention window and the deletion wording, including the statement that capture and storage stop.
