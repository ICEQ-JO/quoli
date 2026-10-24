# QUO-56 — Story projection integration review

Tracking: [QUO-56](https://linear.app/quolii/issue/QUO-56), [PR #76](https://github.com/ICEQ-JO/quoli/pull/76). Advances **P6 — Evidence-grounded change language**.

The supporting agent delivered the Story contract, pure analysis projection, synthetic fixtures/tests and reference documentation. The primary review preserved that work and integrated the OpenCode/main changes before validation.

## Confirmed findings and repairs

- **Session scope:** the root scene included the child's turn and an unrelated missing-rationale claim because all project turns were used. Turns now filter to the requested session; project activity still resolves declared parent/child links.
- **Capture bounds:** supplied file entries were narrated as changes even without a baseline or after capture. Both capture IDs are now required before file nodes/claims are emitted.
- **Unavailable files:** every comparison entry was described as content that differed. File narratives now state the observed comparison status without claiming an unavailable path changed.
- **Recorded gaps:** source-reported capture-disabled and unsupported-source gaps were dropped. They now retain their own nodes, citations and recorded basis.
- **Conflicting results:** identical success labels could hide different exit codes/check outcomes. Tool nodes and conflict claims now preserve those disagreements without choosing an outcome, including non-command tools.

The regressions were reproduced against the supporting branch. New scope/baseline/unavailable-file assertions failed before the repair and pass afterward. The exit-code regression also runs with both source statuses set to success. Existing source authorship and useful code were preserved.

## Validation

- Focused Story/scene checks: 15 pass, 0 fail.
- Combined `pnpm test`: 194 pass, 0 fail, 4 release-gated skips (198 total).
- `pnpm typecheck`: pass.
- `pnpm lint`: pass with the existing 17 warnings and 4 informational diagnostics outside this change.
- `git diff --check`: pass; the documentation conflict preserves both Story and OpenCode implementation records.

Only synthetic fixtures and disposable stores were used. The projection reads no filesystem, runs no commands and makes no model requests. Story remains a library projection; its collector route and dashboard view belong to QUO-57. Hosted delivery, browser rendering of Story and production sessions are not certified by these tests. The PR baseline runs browser/release checks on the updated branch before merge.
