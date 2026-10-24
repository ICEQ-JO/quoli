# QUO-62 — bounded local capacity and session pages

[Quolii issue](https://linear.app/quolii/issue/QUO-62). Advances P2/P3 and the commercial observability gate. Prerequisites QUO-43 and QUO-45 were delivered before implementation.

## Delivered behavior and scope

The local store keeps its 10,000-event and 50 MiB evidence-body budget per project. There is no cap increase, new dependency or schema migration. A session summary reads at most 10,000 retained events and refuses an over-bound store instead of projecting an apparently complete prefix. Event pages remain eight observations with total and cursor metadata. These are retained-record counts, not proof that a producer captured everything.

The session register exposes 50-session receipt-ordered pages with `total` and `nextCursor`. Cursors use each session's first receipt sequence; later events do not move that session between pages. New sessions and retention/deletion may change totals between requests: pages are not a transaction spanning browser requests. Newer/older controls serve Sessions, Overview and Review queue. Counts, filters and queues explicitly cover the selected page; switching project resets pagination. Counts that are missing or no longer match the listed event count stay unknown and offer retry. The project selector's separate existing 50-project bound is unchanged.

Session existence checks now use an indexed project/session lookup, so older sessions can open summaries, exact evidence, event queries, snapshots, comparisons, maps and repository history. Listing aggregates metadata without deserializing every event in every listed session. Only a retained session-start body is parsed for a title.

Ingestion quota checks measure retained counts/bytes once per project per batch under the existing write transaction, then increment locally for newly inserted records. Replays do not consume quota. Conflicts or exceeding either limit roll back the batch; existing evidence is not evicted. `/v1/ingest` returns 507 / `storage_limit` on capacity rejection; `/health.capacityRejected` counts capacity rejections handled by this collector process, resets on restart, and is not a historical loss metric. Bridge retry handling remains unchanged; its spool has its own bounds. Settings states the local caps and distinguishes retained totals from rejected/pending batches. The repository observer is asynchronous: its status and spool are separate from the collector's process counter.

Touched paths: storage read/append callers; collector routes; shared `SessionPage` type; protected browser proxy; dashboard pagination; workspace count hook, list/overview/queue/settings and existing CSS; synthetic fixture, repeatable benchmark script/package command, unit/HTTP/browser tests and reference documentation. No hosted data or private evidence is involved.

## Repeatable capacity measurement

Run `pnpm benchmark:capacity`. It creates and removes a private temporary SQLite directory; no network, paid API, real sessions, repository capture or owner configuration. The mixed v2 source labels are synthetic stand-ins, not a live adapter throughput certification. It loads 100-event batches, measures listing/counts/full root-session summary and activity projection of the entire supplied tree, and asserts rejection of an extra event. A separate store fills synthetic consented code artifacts to within 128 bytes of the 50 MiB limit and asserts event rejection.

Measured 2026-10-24: Node 24.16.0, Linux x86_64 kernel 7.2.7, Intel i7-1185G7 (8 logical CPUs), 15 GiB RAM, shared development machine. Single passes, with other development processes running; no percentile, isolated benchmark, SLA or macOS/Ubuntu certification. Body bytes exclude SQLite indexes, WAL and page overhead. RSS is the process high-water mark, cumulative across workloads, not incremental allocation or collector-only memory.

| Synthetic load | Ingest | List | Kind counts | Root summary | Entire activity tree | Body bytes | DB + WAL + SHM bytes | Max RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 events, one long session/10,000 turns | 2,967.67 ms | 62.35 ms | 65.80 ms | 681.08 ms | 133.30 ms | 8,386,670 | 16,061,120 | 293.4 MiB |
| 10,000 sessions, root + 9,999 declared children | 2,910.67 ms | 81.82 ms | 12.96 ms | 0.87 ms | 270.28 ms | 8,465,555 | 15,893,256 | 348.4 MiB |
| Byte budget, 800 synthetic artifacts | 21,699.35 ms fill | — | — | — | — | 52,428,744 / 52,428,800 | not measured | 369.2 MiB |

An earlier exact-cap run also reached 52,428,800 body bytes and rejected an event. The repeatable script leaves envelope headroom to avoid relying on serialized numeric widths.

Baseline main `23fc110` with the same two event fixtures took 93,121.84 / 92,991.35 ms to ingest. Long-session listing was 338.61 ms; wide-session listing was 14.78 ms. The richer paginated aggregate scans the bounded project metadata and is slower on the wide case. The measured cost justified removing repeated per-event quota scans and full-session deserialization during listing, not adding an index or increasing caps. Existing `(project_id,session_id,sequence)` covers direct session checks. At this measured load the new list remains below 100 ms; this is an observation, not a guarantee.

## Validation and review

198 synthetic unit/integration checks passed (four release-only checks gated in the ordinary suite). Focused HTTP checks verify page metadata, legacy array headers, older-session access, invalid cursors, atomic capacity rejection and its process counter. Boundary tests cover 100 sessions/exact 50-record pages, missing scopes, late records, replay and both quotas. Browser checks cover page-scoped totals, unavailable count rows, failed page/retry, return navigation, opening older evidence and mobile overflow. Desktop/mobile snapshots were inspected together; controls wrap without horizontal overflow.

Primary review traced all `sessions`/`allEvents` callers, transaction/quota rollback, project isolation, pagination ordering and count mismatch handling. It caught and repaired the old newest-50 validation dependency and the unknown-count-to-zero case. No owner capture setting was changed. Full PR baseline checks are required before merging; their recorded GitHub run is the final release/browser evidence.

Limitations: only local synthetic load was measured. No hosted capacity, real provider replay, full-memory ceiling under every payload shape or platform certification. The worst byte workload uses artifacts, not 50 MiB of event projections. Page cursors are browser state and reset on reload; filters/order apply within a page. Unsupported projections fail rather than trim silently; successful retained reads do not establish capture completeness.
