# QUO-65 — Verified updates and compatible rollback

Vision gate: commercial distribution and data controls. Prerequisites [QUO-43](https://linear.app/quolii/issue/QUO-43) and [QUO-64](https://linear.app/quolii/issue/QUO-64) were verified Done before implementation. [Operator reference](../verified-updates.md).

## Delivered increment

- Explicit `quoli update ARCHIVE TRUSTED_PUBLIC_KEY EXPECTED_VERSION`, `quoli update rollback` and `quoli update recover`.
- Private bounded input snapshots; existing Ed25519/hash verifier; narrow POSIX/ustar/PAX extraction with path/type/link/size checks and no candidate execution.
- Recoverable same-filesystem staging/activation, one retained previous code copy, atomically published/retired journal and startup interlock. The initial-install command now refuses unsigned replacement of an existing installation.
- Signed manifest/inner metadata `storageVersion` derived from the unchanged ordered storage migrations. Read-only compatibility checks refuse unsupported database history before update, rollback or managed start. No migration or database restore happens in the updater.
- Existing per-user install/lifecycle identity, capture, evidence, hook paths and data locations remain authoritative. Uninstall removes both owned code copies while preserving evidence.

## Scope and review

Touched callers: CLI dispatch/help, install/uninstall, managed startup, release builder/schema, ordered storage migration inventory, synthetic update/release tests and operator/implementation references. No UI, adapter, network transport, dependency, owner tool configuration or private store change.

Primary review used Ponytail Review and traced install/start/stop/recovery callers. It resolved the concrete interrupted-cleanup journal case, candidate-owned marker overwrite, install/data/rollback overlap and startup/update reservation race. Parser tests include regular/PAX traversal, symlink-parent and escaping links, duplicates, unsupported hard/device members, invalid checksums, truncation and invalid gzip. No independent security certification is claimed.

## Validation

- Typecheck passes. Lint passes with the existing 17 warnings/four infos.
- Full synthetic unit/integration suite: **215 tests, 210 passed, five release-gated skips, zero failures**.
- Six focused updater tests cover successful update/rollback, signature/metadata/version/port failures, database downgrade refusal, hostile archives, overlap/live-journal refusal and nine child-process interruption boundaries. Evidence-file hashes stay unchanged across update/recovery/rollback; candidate code is constructed to throw if executed during verification.
- Packaged release checks cover the actual relocated CLI, tampered refusal, installed-command overwrite refusal, real verified update and subsequent managed start, retained evidence bodies/captures, compatible rollback and restart, integration-aware uninstall, existing listener/crash recovery and standalone verification. Final outcomes and required CI are recorded in the linked PR/Linear issue.
- Local unsigned release builds successfully. Signed candidates use ephemeral test keys and explicitly synthetic test provenance; no production tag/key or public release is created.
- The existing owner-requested synthetic preview remains running at loopback port 3140 in its separate temporary store.

## Material limits

Only Linux x64/Node 24 local filesystems are covered. There is no downloader, unattended update, automatic restart, online key revocation, database downgrade or data-backup restore. Stop other writers and disable optional login startup. The activation uses two renames with a brief possible absent install path; recover from a separate trusted CLI if interrupted there. Process-interruption tests do not certify power-loss/network-filesystem durability. Interrupted reservation/cleanup can leave nonblocking private temporary directories. Earlier trusted verifiers may need replacement to understand the new optional signed storage field. Existing private sessions and owner installations were not used.
