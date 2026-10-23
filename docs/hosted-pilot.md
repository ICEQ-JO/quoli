# Hosted pilot: buyer, pricing, platforms and retention

Decision record for [QUO-38 / V01](https://linear.app/quolii/issue/QUO-38/v01-set-hosted-pilot-buyer-pricing-platform-and-retention-limits), recorded 2026-10-23. Each choice below is either an owner decision or a named blocker with an owner and a follow-on issue. Nothing here authorizes uploading existing evidence, implementing billing, or deploying to production.

## Decisions

| Choice | Decision | Follow-on |
| --- | --- | --- |
| First paid buyer | Individual developers and teams of 2–10 who already pay for Claude Code or OpenCode and want to review their agent evidence. Not enterprise compliance buyers. | — |
| Plan and price | One hosted **Pilot** plan at **USD 19 per seat per month**, billed monthly. Seats are workspace members. Prices exclude tax. Annual pricing and discounts are not decided. | QUO-68 |
| Trial and plan limits | **Open — owner deferred on 2026-10-23.** Proposed defaults: 14-day trial without a card; 3 projects, 3 devices, 250,000 events per month and 1 GB captured content per workspace. At any cap, uploads report a visible blocked state and retained evidence is preserved; nothing is dropped silently. | QUO-68 |
| Cancellation and refund | **Open with the limits decision.** Proposed: cancel at period end; full refund within 14 days of the first charge; no partial-month refunds; evidence stays readable and exportable for 30 days after the subscription ends. | QUO-68 |
| Connector platforms | Linux x64 on Ubuntu 24.04 or later, and macOS 14 or later on arm64 and x64. The connector pins Node 24.16. Windows is excluded until its own certification issue; the web dashboard itself is browser-based and OS-independent. | QUO-64, QUO-66, QUO-67 |
| Cloud retention default | **90 days**, adjustable per project from 7 to 365 days. Evidence older than the window stops being queryable in the dashboard but remains exportable for 30 days; then it is deleted, and encrypted backups expire within 30 days of that deletion. Local retention is separate and defaults to keeping everything (maximum 365 days). | QUO-32 |
| Launch success criteria | Measured over the first 60 days of paid availability: 5 paying workspaces; at least 80% of trial workspaces pair a device and view first evidence within 15 minutes; at least 60% of activated workspaces still upload in week 4; zero confirmed cross-tenant exposures and zero unconsented uploads; connector sessions complete without a crash at least 99% of the time; ingestion p95 under 2 seconds and dashboard query p95 under 1.5 seconds; first support response within one business day. | — |

Hosting provider and region, data residency, and the auth and payment vendors are tracked in [C01/QUO-19](https://linear.app/quolii/issue/QUO-19/c01-specify-the-hosted-data-flow-sync-contract-and-threat-model) and [C03/QUO-21](https://linear.app/quolii/issue/QUO-21/c03-implement-cloud-user-sign-in-and-secure-session-lifecycle). They are not decided here and do not block this record.

## First-user journey

The target journey is the activation measure above. Times are budgets, not measured results.

| Step | Budget |
| --- | --- |
| Sign in and create a workspace and project | 2 minutes |
| Pair a device: one-time code, preview of capture categories, destination, retention and project scope, then install the connector | 5 minutes |
| Connect a repository and a harness (Claude Code or OpenCode) | 3 minutes |
| First evidence: session list, reported cost and change scene after the first turn | 2 minutes |
| Controls: pause, change retention, export, revoke the device | 2 minutes |

Pairing shows capture consent and cloud upload consent separately. Denying upload leaves local capture unchanged.

## Budget and retention examples

Synthetic arithmetic from stated assumptions, not measurements: 22 working days per month, 100 retained events per session, 1 MB of captured content per session.

| Profile | Sessions per day | Events per month | Content per month | 90-day stored content |
| --- | --- | --- | --- | --- |
| Light | 2 | 4,400 | 44 MB | about 130 MB |
| Typical | 6 | 13,200 | 132 MB | about 400 MB |
| Heavy | 20 | 44,000 | 440 MB | about 1.3 GB |

The proposed event cap is reached at roughly 114 sessions per day; the proposed 1 GB content cap at roughly 46 sessions per day. A five-seat heavy team would exceed 1 GB per workspace, so the deferred limits decision must choose either a per-seat content allowance or a higher workspace cap. Retention, not monthly ingest, dominates stored volume: 90 days of heavy use is about 1.3 GB.

## What this record does not authorize

- Uploading existing private sessions, or changing anyone's capture settings.
- Implementing billing, entitlements or trials before QUO-68 and the limits decision.
- Deploying paid production resources.
- Reopening the approved cloud direction or the vision's platform exclusion of Windows.

## Validation

Source review only: the [vision gates](vision.md), [decisions](decisions.md), [local retention and quota behaviour](lifecycle-controls.md), the 50 MiB and 10,000-event local project quota, and the pinned Node engine range. The budget tables are hand arithmetic. No application test result is claimed for this documentation change.

## Open items

1. Trial, plan limits and cancellation/refund: **owner decision required** before QUO-68 starts. The proposed defaults above are a starting point, including the per-seat versus per-workspace content allowance.
2. Annual pricing and discounts: not decided; monthly only for the pilot.
3. Browser support beyond the Chromium build used by the browser checks: not certified.
