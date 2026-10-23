# Dashboard redesign review

The founder requested a replacement dashboard experience, preserving the working evidence flows. The browser inspection found an app that opened directly into one session, with no workspace orientation or separate session library. The implemented redesign adds Overview and Sessions before the focused Activity / Usage / Coverage review.

Historical GitHub delivery issues: [workspace and session library #25](https://github.com/ICEQ-JO/quoli/issues/25), [review workbench #26](https://github.com/ICEQ-JO/quoli/issues/26). Ongoing work is tracked only in the Quolii Linear workspace.

## Delivered experience

- Overview derives session/observation counts and a capture-gap review queue from retained evidence. Failed summaries remain unknown and support retry.
- Sessions supports title search and capture-boundary filtering. Search text stays outside navigation URLs.
- Session review retains full-history activity search, filters, source/receipt ordering, pagination, copyable source links and explicit-ID request/result traversal.
- A local connection preserves validated destination IDs through the credential-cookie redirect. No arbitrary return URL is accepted.
- The visual system uses ink navigation, white reading surfaces, cobalt selections, locally served Geist typography and a visible two-endpoint evidence route. A code surface distinguishes tool payloads.
- Responsive navigation condenses to a rail and then top navigation. A native mobile evidence sheet synchronizes with URL state and browser history.

## Captures

![Workspace overview](screenshots/workspace-overview.png)

![Evidence workbench](screenshots/evidence-workbench.png)

[Mobile overview](screenshots/mobile-overview.png) · [Mobile evidence sheet](screenshots/mobile-evidence.png)

These are authored synthetic sessions, not production customer data or live-agent captures.

## Finish review

A fresh reviewer independently inspected the source and six desktop/mobile screenshots against the direction contract and craft guidance. The installed skill named a reviewer/documenter role but did not include those agent templates; explicit fresh-context handoffs carried the role contracts instead. Browser-test results were supplied by the build thread, not independently rerun by the reviewer.

| Finding | Final verdict | Resolution |
| --- | --- | --- |
| F1: mobile sheet could outlive its selected route | Resolved | Route synchronization closes the sheet when event selection clears or the view leaves Activity. Escape and Close clear event state. Back/Forward and reopening are verified. |

**Final disposition: PASS.** No open material findings. This is a bounded internal finish review, not external certification or a claim of awards.

## Validation

- `pnpm test`: 15 unit/integration/lifecycle checks passed.
- `pnpm test:e2e`: six browser flows passed, including workspace/library/queue navigation, summary failure/Retry, full-history search, source traversal, unknown usage, fresh-cookie deep links, hostile HTML, mobile focus and history.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` passed.
- `pnpm smoke` confirmed both local services reachable and authenticated.
- Browser inspection at 1440px desktop and 390px mobile; no horizontal overflow at 1280, 900, 768, 390 or 320px in the session library.
- One mechanical design-detector run returned `[]`. The production build retains the `2f68dc64` direction contract.

## Limits

Workspace counts cover the retained session list returned by the existing API (up to 50 sessions), not complete agent capture. Synthetic fixtures remain the only ingestion path. Real collection, repository snapshots, diffs and the bounded change map remain separate planned increments. No cloud service or runtime font host was introduced.
