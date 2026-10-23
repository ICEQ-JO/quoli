# QUO-41 — overnight CI baseline result

Issue: [QUO-41](https://linear.app/quolii/issue/QUO-41) · Branch: `feat/quo-41-ci-baseline` · Base: `main` · PR: [#61](https://github.com/ICEQ-JO/quoli/pull/61)

Advances **Commercial: CI and release discipline, legal and trust**.

## Delivered baseline

`.github/workflows/pr-baseline.yml` runs on every pull request and manual dispatch with read-only `contents` permission. It checks out without retaining credentials, uses exact Node 24.16.0 and the repository-pinned pnpm 11.12.0, then runs the existing locked install, lint, typecheck, unit/integration suite, fixture-only Playwright suite, local release build and release lifecycle suite.

The release builder already rejects environment files, credential files, database files and external symlinks before it archives the package. The workflow also verifies the generated SHA-256 file and independently rejects those private-runtime path classes from the archive listing. It does not upload artifacts, caches, runtime stores, browser traces, credentials or logs.

Action references are full commit SHAs verified from the official `actions/checkout` and `actions/setup-node` tag refs on 2026-10-23. The first hosted run exposed a one-character `setup-node` SHA transcription error. Its corrected v5 SHA still failed GitHub Actions resolution, so the workflow uses the official current v4 SHA that GitHub can resolve; it still installs exact Node 24.16.0. No dependency cache is used: the locked install is small enough to avoid adding cache-key and untrusted-archive risk to this first baseline.

## Scope check

| Area | Result |
| --- | --- |
| Callers | GitHub pull requests and manual dispatch invoke the workflow; no application caller changes. |
| Existing checks | Root scripts in `package.json`, `playwright.config.ts`, `tests/*.test.ts`, and `tests/browser/*` are reused. |
| Fixtures | Existing synthetic test fixtures only; no private sessions, credentials or runtime evidence added. |
| Config | New `.github/workflows/pr-baseline.yml`; no lockfile, release-builder or bridge/privacy changes. |

## Validation evidence

| Check | Outcome |
| --- | --- |
| Workflow/action pins | Checked full SHA refs against official action tag refs on 2026-10-23. GitHub Actions run [39886684524](https://github.com/ICEQ-JO/quoli/actions/runs/39886684524) passed on the PR: every workflow step completed successfully. |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Passed: lint reported three existing warnings; typecheck passed; 120 tests passed and four release-only tests skipped. |
| `pnpm test:e2e` | Passed: 35 fixture-only browser tests passed in 2.0 minutes. |
| `pnpm release:local` / `pnpm test:release` / archive inspection | Passed: built a 1,330-file archive; release lifecycle tests passed 4/4; SHA-256 verified and private-path listing check passed. The first local preflight found that checksum verification had to run from `dist/`; the workflow was corrected and rerun before commit. |
| Deliberate failure detection | Passed: a disposable missing Biome configuration exited 1; no intentional failing change was retained. |
| Known bridge privacy baseline | Reproduced with a synthetic prompt and failed delivery: bridge spool stored the prompt without checking disabled capture policy. Agent 1 owns the repair; this branch changes neither bridge code nor test expectations. |

## Limits and next safe action

This is an automated PR baseline, not evidence that branch protection is enabled, a release is signed, or every GitHub runner/platform path has passed. The next safe action is to run the workflow-equivalent commands locally, reproduce the known bridge-spool privacy failure against synthetic data, then push a reviewable PR and record the observed GitHub checks.
