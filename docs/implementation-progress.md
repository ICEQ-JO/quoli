# Implementation checkpoint

This is a working checkpoint, not a release certification. The source tree, tests, running application and linked PRs are authoritative. Update this page as each increment is demonstrated.

| Capability | Current evidence | Remaining work |
| --- | --- | --- |
| Local collector, persistent normalized history, synthetic sessions | [PR #22](https://github.com/ICEQ-JO/quoli/pull/22), unit/integration/lifecycle checks | Live-source compatibility and lifecycle controls are separate gates. |
| Full-history activity search, source inspection and reported usage | [PR #24](https://github.com/ICEQ-JO/quoli/pull/24), browser flows | Live-source reconciliation and null handling must be verified against real supported contracts. |
| Workspace overview, library and redesigned evidence workbench | [PR #27](https://github.com/ICEQ-JO/quoli/pull/27), six passing browser flows, independent finish PASS | Superseded by the founder-approved session-first workspace on `feat/compact-workbench` ([#32](https://github.com/ICEQ-JO/quoli/issues/32)); see [research](design/product-ui-research.md) and [implemented workflow](design/session-workspace.md). |
| Session-first work list, review document and gap queue | [Issue #32](https://github.com/ICEQ-JO/quoli/issues/32), 68 unit/integration and 14 browser checks, independent finish PASS; [workflow and screenshots](design/session-workspace.md) | Founder visual feedback and live integration remain separate. |
| Explicit repository registration and read-only snapshots | [PR #28](https://github.com/ICEQ-JO/quoli/pull/28), [issue #9](https://github.com/ICEQ-JO/quoli/issues/9), CLI/storage/temporary Git checks and browser registration flow | Linux descriptor traversal is supported; unsupported platforms fail closed. |
| Before/after file inspection | Implemented on `feat/captured-diffs`, [#10](https://github.com/ICEQ-JO/quoli/issues/10); deterministic diff and scoped API checks, desktop/mobile inspection | Live-source capture remains a separate gate. See [review behavior and bounds](captured-changes.md). |
| Evidence-backed checks and change map | Checks implemented on `feat/evidence-checks`, [#11](https://github.com/ICEQ-JO/quoli/issues/11); [verification evidence](verification-evidence.md), unit and browser checks | The bounded change map ([#12](https://github.com/ICEQ-JO/quoli/issues/12)) remains planned. Derive only from established records; expose uncertainty and keyboard-equivalent lists. |
| Retention/deletion and capture controls | Planned [#13](https://github.com/ICEQ-JO/quoli/issues/13) | Required before real-session data paths. |
| Claude compatibility, hooks, usage reconciliation and setup | Planned [#14](https://github.com/ICEQ-JO/quoli/issues/14)–[#19](https://github.com/ICEQ-JO/quoli/issues/19) | Official contract refresh, disposable runtime verification, passive opt-in bridge and reversible setup. |
| Ready-to-use pilot | Planned [#20](https://github.com/ICEQ-JO/quoli/issues/20) | End-to-end real-project verification; synthetic demo passing alone cannot satisfy this. |

## Supporting work

The founder requested OpenCode agents with a free MiniMax model. The installed model list exposes `opencode/minimax-m3.1-flash-free`; isolated supporting runs supplied the repository reader and bounded diff engine, both reviewed and tested before integration. A subsequent checks-analysis draft is awaiting primary-agent review. Their output is not trusted as finished until reviewed and rerun by the primary agent. No real session evidence or credentials are supplied to those agents.

PRs are stacked and unmerged. The application can run from the latest working branch; publication does not authorize an automatic merge. Existing upstream PRs must be integrated in dependency order when the owner authorizes merging.
