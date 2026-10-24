# QUO-64 — versioned signed artifacts

[Quolii issue](https://linear.app/quolii/issue/QUO-64). Commercial pillar: distribution, CI and release discipline. Prerequisites QUO-38 and QUO-41 verified Done in Quolii before implementation.

## Scope and decisions

Use root package.json as the version source and retain explicit `-local` unsigned builds. Add strict versioned manifest/signature contracts, streaming verification, protected-key loading, clean-tag/toolchain checks, deterministic archive metadata and a standalone pre-extraction verifier. Preserve the production bundle, installed CLI behavior, leak checks and synthetic release baseline. No dependency, evidence schema/storage migration, account credential, owner runtime setting or hosted upload is added.

Touched callers/config/exports: root scripts/version; schema release subpath; CLI-owned verification helpers; release source/archive/builder/verifier scripts; signed Next build ID configuration; synthetic crypto/source/archive tests and the packaged verifier release check; CLI/setup/current-capability references. No UI/design changes. The existing PR baseline automatically runs the added unit and gated release checks.

Node 24's official crypto contract requires a null algorithm for Ed25519 `sign`/`verify`; key fingerprints hash DER SPKI. The signature covers a Quoli manifest domain prefix plus exact UTF-8 manifest bytes. Strict contracts bind product, format, stable version, matching tag/filename, Linux x64, runtime/toolchain, source and archive hash/size. The caller independently pins the public key and expected version. [Node crypto reference](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptosignalgorithm-data-key-callback), [GNU tar reference](https://www.gnu.org/software/tar/manual/html_node/Reproducibility.html). Actual cryptographic tests use installed Node 24.16.0; no newer-only crypto API is used.

Primary review checks include key algorithm/type, bounded no-follow regular-file reads, key ownership/mode/out-of-checkout location, signature domain/key substitution, version replay, mutable files, atomic source checks and environment leakage. Review caught ignored dotenv inputs bypassing a clean git status: signed builds refuse production dotenv files and use a restricted build environment. A local host/compiler compromise and post-verification file replacement are outside the standalone verifier's guarantee; documented explicitly rather than presented as sandboxing or automatic secure updates.

## Verification

Initial implementation: six focused signing tests passed; 204 unit/integration checks passed with five release-gated skips. Typecheck passed. Full packaging, two clean tagged synthetic-key builds and required PR baseline evidence are recorded below as they complete; no production signing identity or public release is implied.

Limits: no public tag/release publication, production key provisioning, macOS/Windows certification, online revocation/freshness, automatic verified updates or claim of byte-identical Next application builds without measurement. QUO-65 owns verified install/update/rollback. Artifact checksums alone are not an authentication mechanism.
