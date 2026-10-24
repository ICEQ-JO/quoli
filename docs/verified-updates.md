# Explicit verified updates and compatible rollback

[QUO-65](https://linear.app/quolii/issue/QUO-65) advances the commercial distribution and data-controls gates. Updates use an operator-supplied signed archive, independently trusted Ed25519 public key and explicit expected version. There is no downloader, background update, production signing key or automatic restart.

## Update

Use the same user, install/data directories and port configuration as the installed runtime. Disable optional login startup and stop the managed runtime first. Close other processes writing the evidence store. The install parent must be owned by the user and not writable by other users.

```sh
quoli autostart disable  # only if enabled
quoli stop
quoli update /downloads/quoli-0.2.0-linux-x64.tar.gz /trusted/release-public.pem 0.2.0
quoli start
```

The archive's `.manifest.json` and `.sig` must be adjacent. Obtain the key/fingerprint through an independently authenticated channel as described in [release trust](releases.md#trust-and-rotation). A key beside an untrusted download does not establish trust. The example version is illustrative, not a published release.

A failed signature, hash, expected-version, platform/runtime, archive, installed-ownership, port or compatibility check refuses activation. The command snapshots bounded regular inputs into a private sibling transaction directory, verifies that exact snapshot, and never runs candidate code to verify it. Only a strictly newer stable version is accepted; local `X.Y.Z-local` installs compare using `X.Y.Z`. No automatic key discovery or freshness/revocation service is implied.

The signed manifest and inner `release.json` must agree on identity, source, toolchain and `storageVersion`. Older signatures remain readable by the current standalone verifier, but update requires the explicit storage declaration. A pre-QUO-65 verifier rejects the new optional field; obtain a current verifier through the trusted channel. The first update from an older CLI without an update command must be initiated using a current independently verified, safely unpacked trusted CLI rather than executing an unauthenticated candidate.

## Archive boundary

The updater accepts the builder's POSIX/ustar gzip shape: regular files, directories, internal symbolic links, and bounded PAX path/link/timestamp metadata. It rejects absolute/traversing or control-character paths, duplicates, non-directory parents, escaping/dangling links, hard links, device/FIFO members, unsupported extensions, invalid checksums and truncation. Files are written before symbolic links; every resolved link must stay inside the extracted release. Set-id and write-for-others bits are not installed.

Compressed and expanded content each have a 512 MiB ceiling, at most 10,000 members, 4,096-character paths and 16 KiB extended headers. These are release-package bounds, not an evidence-store limit. Extraction happens only in a newly created private directory. This follows the isolation principles in the [GNU tar security guidance](https://www.gnu.org/software/tar/manual/html_section/Security.html); the updater's deliberately narrow reader does not invoke tar or execute post-install commands.

## Activation and interruption recovery

The complete candidate is staged beside the existing install, on the same filesystem. A private `<install>.update` journal serializes updates and blocks new managed starts/install/uninstall while recovery is pending. Startup rechecks after reserving its managed state so a racing update cannot launch an unchecked runtime.

Activation renames the old install into the journal, then activates the complete candidate with one directory rename. The old code becomes `<install>.rollback`; one previous code version is retained. Existing launchers, hook paths and evidence directories stay stable. Older rollback code is removed only after the new candidate is ready; an interrupted activation restores the old install, while recovery after the final commit rename keeps the completed new install.

There is a brief interval between the two activation renames when the install path can be absent. If the process exits there, run recovery with a **separate trusted unpacked release**, using the same installation/data configuration:

```sh
node /trusted/unpacked/quoli/cli.mjs update recover
```

If the installed command still exists, `quoli update recover` is equivalent. Recovery refuses a still-present updater process, an untrusted journal or incompatible data; it never signals a recorded PID. It either restores the interrupted previous code or finishes committed cleanup. It never resets the database. If ownership/version checks fail, all retained code copies are left for inspection. Journal publication and completed-journal retirement are directory renames, so interruption cannot leave a half-written blocking journal. A crash during reservation or cleanup may leave an unused private `.update-reserve-*` or `.update-cleanup-*` directory; the current app is untouched. No power-loss, network-filesystem or hostile same-user filesystem certification is claimed.

## Roll back code, never evidence

```sh
quoli stop
quoli update rollback
quoli start
```

Rollback swaps the current and retained previous code through the same recoverable transaction. It does not undo settings, erase events, restore an old database backup or reverse migrations. It also requires login startup disabled and matching free ports. Uninstall removes both owned code copies after the existing integration/lifecycle checks; evidence remains separate.

`storageVersion` is the highest shipped migration number, derived from the existing ordered migration inventory. Before update, rollback and managed start, Quoli reads the retained migration history without changing it. A contiguous older store may be upgraded by the existing storage layer when the user explicitly starts the new runtime. If that start applies migration N and the previous code only supports N-1, rollback is refused. Keep the new code or follow a separately reviewed backup/recovery procedure; the updater never silently downgrades evidence. Backups and deletion obligations remain the owner's existing data-lifecycle responsibility.

Initial `install` still accepts a trusted unpacked local build, but refuses to overwrite an existing install. Use verified `update`, or explicitly uninstall before a local reinstall. This closes the prior unsigned replacement path in the current CLI; it is not protection against a user deliberately executing arbitrary older software.

## Validation scope

Synthetic tests use ephemeral keys and disposable stores/installations. They cover signed update and explicit rollback without executing candidate code, wrong/tampered identities, unsafe archives, occupied ports, storage downgrade refusal, overlapping paths and live-update recovery refusal. Child processes terminate at journal publication, extraction setup and each activation rename; recovery is checked against exact retained evidence bytes. The packaged release test additionally updates and starts the actual relocated runtime, preserves existing evidence bodies and captures, rolls back and starts again, and uninstalls both code copies.

No private session, owner install, production key, paid provider or cloud upload is used. Linux x64/Node 24 is the supported runtime; other platforms and actual login/reboot behavior remain separate validation gates.
