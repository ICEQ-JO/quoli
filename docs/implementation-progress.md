# Implementation checkpoint

This is a working checkpoint, not a release certification. The source tree, tests, running application and linked PRs are authoritative. Update this page as each increment is demonstrated.

| Capability | Current evidence | Remaining work |
| --- | --- | --- |
| Local collector, persistent normalized history, synthetic sessions | [PR #22](https://github.com/ICEQ-JO/quoli/pull/22), unit/integration/lifecycle checks | Live-source compatibility and lifecycle controls are separate gates. |
| Full-history activity search, source inspection and reported usage | [PR #24](https://github.com/ICEQ-JO/quoli/pull/24), browser flows | Live-source reconciliation and null handling must be verified against real supported contracts. |
| Workspace overview, library and redesigned evidence workbench | [PR #27](https://github.com/ICEQ-JO/quoli/pull/27), six passing browser flows, independent finish PASS | Preserve this visual system as new functional views join it. |
| Explicit repository registration and read-only snapshots | Implemented on `feat/repository-snapshots`, [issue #9](https://github.com/ICEQ-JO/quoli/issues/9), CLI/storage/temporary Git checks and browser registration flow | Linux descriptor traversal is supported; repository diffs join the dashboard in the next increment. |
| Before/after file inspection | Supporting diff-engine work for [#10](https://github.com/ICEQ-JO/quoli/issues/10) | Integrate snapshot pairs, source links and bounded dashboard inspection. |
| Evidence-backed checks and change map | Planned [#11](https://github.com/ICEQ-JO/quoli/issues/11), [#12](https://github.com/ICEQ-JO/quoli/issues/12) | Derive only from established records; expose uncertainty and keyboard-equivalent lists. |
| Retention/deletion and capture controls | Planned [#13](https://github.com/ICEQ-JO/quoli/issues/13) | Required before real-session data paths. |
| Claude compatibility, hooks, usage reconciliation and setup | Planned [#14](https://github.com/ICEQ-JO/quoli/issues/14)–[#19](https://github.com/ICEQ-JO/quoli/issues/19) | Official contract refresh, disposable runtime verification, passive opt-in bridge and reversible setup. |
| Ready-to-use pilot | Planned [#20](https://github.com/ICEQ-JO/quoli/issues/20) | End-to-end real-project verification; synthetic demo passing alone cannot satisfy this. |

## Supporting work

The founder requested OpenCode agents with a free MiniMax model. The installed model list exposes `opencode/minimax-m3.1-flash-free`; isolated supporting runs are implementing the repository reader and bounded diff engine. Their output is not trusted as finished until reviewed and rerun by the primary agent. No real session evidence or credentials are supplied to those agents.

PRs are stacked and unmerged. The application can run from the latest working branch; publication does not authorize an automatic merge. Existing upstream PRs must be integrated in dependency order when the owner authorizes merging.
