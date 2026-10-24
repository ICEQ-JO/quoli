# QUO-64 — versioned signed artifacts

[Quolii issue](https://linear.app/quolii/issue/QUO-64). Commercial pillar: distribution, CI and release discipline. Prerequisites QUO-38 and QUO-41 verified Done in Quolii before implementation.

## Scope and decisions

Use root package.json as the version source and retain explicit `-local` unsigned builds. Add strict versioned manifest/signature contracts, streaming verification, protected-key loading, clean-tag/toolchain checks, deterministic archive metadata and a standalone pre-extraction verifier. Preserve the production bundle, installed CLI behavior, leak checks and synthetic release baseline. No dependency, evidence schema/storage migration, account credential, owner runtime setting or hosted upload is added.

Touched callers/config/exports: root scripts/version; schema release subpath; CLI-owned verification helpers; release source/archive/builder/verifier scripts; signed Next build ID configuration; synthetic crypto/source/archive tests and the packaged verifier release check; CLI/setup/current-capability references. No UI/design changes. The existing PR baseline automatically runs the added unit and gated release checks.

Node 24's official crypto contract requires a null algorithm for Ed25519 `sign`/`verify`; key fingerprints hash DER SPKI. The signature covers a Quoli manifest domain prefix plus exact UTF-8 manifest bytes. Strict contracts bind product, format, stable version, matching tag/filename, Linux x64, runtime/toolchain, source and archive hash/size. The caller independently pins the public key and expected version. [Node crypto reference](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptosignalgorithm-data-key-callback), [GNU tar reference](https://www.gnu.org/software/tar/manual/html_node/Reproducibility.html). Actual cryptographic tests use installed Node 24.16.0; no newer-only crypto API is used.

Primary review checks include key algorithm/type, bounded no-follow regular-file reads, key ownership/mode/out-of-checkout location, signature domain/key substitution, version replay, mutable files, pre/post-build source checks and environment leakage. Review caught ignored dotenv inputs bypassing a clean git status: signed builds refuse production dotenv files and use a restricted build environment. A local host/compiler compromise and post-verification file replacement are outside the standalone verifier's guarantee; documented explicitly rather than presented as sandboxing or automatic secure updates.

## Verification

Initial implementation: six focused signing tests passed; 204 unit/integration checks passed with five release-gated skips. Typecheck passed. Full packaging, two clean tagged synthetic-key builds and required PR baseline evidence are recorded below as they complete; no production signing identity or public release is implied.

Limits: no public tag/release publication, production key provisioning, macOS/Windows certification, online revocation/freshness, automatic verified updates or claim of byte-identical Next application builds without measurement. QUO-65 owns verified install/update/rollback. Artifact checksums alone are not an authentication mechanism.

## Clean tagged build measurement — 2026-10-24

A disposable local clone of implementation commit `2e7bab9180623e79783b34ec1a1220c9fb9d300f` was tagged `v0.1.0` **only inside that clone**. No public/root-repository release tag was created. Locked dependencies were installed; a fresh ephemeral Ed25519 private key lived outside the clone in a 0600 file. Two full `pnpm release:signed` builds ran in the same checkout with the same key, dependency tree and host. Both verified through the bundled standalone verifier before any archive extraction.

Both archives were **13,520,646 bytes**, SHA-256 `3990e5fbcf9d9b5a517b34a44c7027a44685fe1c04e78769d86f00cbb4070661`. No differences were found in the 1,370 regular-file/symlink inventory entries (1,341 regular files). The clone remained clean. A scan of every bundled regular file found no ephemeral private PEM. All **five packaged release tests passed**, including the relocated signed-version CLI, capture/restart/uninstall, listener safety/recovery and standalone verifier acceptance/tamper rejection. The private key was deleted after validation.

Measured scope: Linux x64 development host, Node 24.16.0, pnpm 11.12.0, same absolute build path, same installed dependencies and two passes. This demonstrates identical full-build bytes under those conditions; it does not promise identical archives across paths, machines, compiler/library versions, platforms or future Next.js releases. Private `.env` inputs are refused, not reproduced. Final review additionally isolated Git provenance reads from inherited `GIT_DIR`/replacement contexts, with a concrete regression test; that hardening does not change these measured inputs or archive format.
