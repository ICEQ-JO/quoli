# Versioned release artifacts

[QUO-64](https://linear.app/quolii/issue/QUO-64) advances the commercial distribution/CI gate. The builder preserves the current standalone web/collector/CLI/bridge bundle and privacy scan. It does not publish a GitHub release, create a production tag, select an owner signing identity, install an update or enable capture.

## Version and build inputs

Root `package.json.version` is the release version source, currently `0.1.0`, using stable `X.Y.Z` versions. `pnpm release:local` produces `0.1.0-local` and remains explicitly unsigned. Runtime `release.json` format 1 stays compatible and gains channel/source/toolchain provenance. Signed artifacts use the stable version and require a clean checkout at a matching `vX.Y.Z` tag, Linux x64, Node 24.16.0, pnpm 11.12.0 and the committed lockfile. Current release contents support Linux only; macOS certification is QUO-66.

Before a signed build, install the locked dependencies in a disposable clean checkout. No environment files may be present at the root or web application in the production dotenv locations (`.env`, `.env.local`, `.env.production`, `.env.production.local`). Signed Next builds inherit only PATH, HOME and PNPM_HOME, plus the builder's fixed build options/locale/timezone. The signing key path is removed from child environments. This is input control on a trusted host, not a sandbox or proof that a compromised compiler/dependency cannot read a local key.

The source commit/time, tag, clean state, Node/pnpm versions and SHA-256 of `pnpm-lock.yaml` are declared in provenance. Signed Next build IDs use the source commit. GNU tar sorts names and normalizes timestamps, ownership and permissions; gzip excludes original filename/wall-clock timestamp. See [GNU tar reproducibility](https://www.gnu.org/software/tar/manual/html_node/Reproducibility.html) and the installed Next.js `generateBuildId` reference. Two full signed builds were byte-identical in the measured same-checkout/same-host run; this is not a cross-machine/path/platform guarantee. The work record records exact hashes and conditions.

## Sign a build

Use an independently provisioned Ed25519 PKCS#8 PEM key, held outside the source checkout, in a regular file owned by the builder user with no group/other permissions (0600 or 0400). No PEM or passphrase goes in an argument, environment variable or repository; only the file path is provided. Encrypted-key prompts, HSMs and remote signing are not implemented.

```sh
QUOLI_SIGNING_KEY_FILE=/secure/location/release-key.pem pnpm release:signed
```

The signed path fails before building for an absent/insecure/non-Ed25519 key, dirty tree, wrong tag, dotenv file or unsupported toolchain/platform. It rechecks source inputs after building. It produces:

- `dist/quoli-X.Y.Z-linux-x64.tar.gz` and its `.sha256` checksum.
- Adjacent `.manifest.json` with archive name/size/hash and declared platform, runtime and source/toolchain provenance.
- Adjacent `.sig`, an Ed25519 signature envelope with a public-key fingerprint. The domain-separated signature covers the exact manifest bytes; the manifest hash binds the archive.
- `dist/verify-release.mjs`, a Node-only bundled verifier with no pnpm or source dependency.

The signing key is never copied into the release. The builder retains filename/environment/database and external-symlink leak checks. A successful build is not permission to publish its contents.

## Verify before extraction

Obtain a trusted verifier and an SPKI PEM public key from an independently authenticated source, verify its SHA-256 SPKI fingerprint through that channel, and pin the expected version. Neither the download's signature envelope nor a public key alongside an untrusted download establishes trust. Do not execute the candidate archive's CLI to establish authenticity.

```sh
node /trusted/location/verify-release.mjs   quoli-X.Y.Z-linux-x64.tar.gz /trusted/location/release-public.pem X.Y.Z
```

From an already trusted source checkout, `pnpm release:verify ARCHIVE TRUSTED_PUBLIC_KEY EXPECTED_VERSION` is equivalent. The verifier checks bounded strict manifest/signature schemas, Ed25519 key/fingerprint/signature, the expected version/name and the archive's byte count/SHA-256 using a bounded streaming read. Missing signatures, a substituted key, altered metadata, altered archive bytes, unsupported identities and oversized/non-regular inputs fail. It neither extracts nor executes archive contents. Verify and consume the same unchanged archive; this standalone command does not lock files for a later extraction.

Only after successful verification should the archive be unpacked and its existing `install` command used. Installation itself retains the existing local behavior: it does not enforce signature verification or implement downgrade prevention/update rollback. Verified update/install integration is QUO-65. The standalone verifier can authenticate an older release if that older expected version is explicitly supplied; it is not an online freshness service.

## Trust and rotation

No production signing key/fingerprint or release publication is configured by this increment. Tests generate ephemeral keys only. The owner must provision custody, publish the verifier/public key/fingerprint through an authenticated independent channel and approve the version/tag before a public release. Never treat a test key as a production trust anchor.

For rotation, authenticate the replacement key/fingerprint through the existing trusted channel before using it, retain old trust only for deliberately supported historical releases, and remove a compromised key from the trusted key set immediately. Consumers choose an explicit trusted key file; there is no auto-import of keys from manifests and no hidden network key lookup/revocation check. Revocation notices must reach consumers out of band; offline copies cannot discover them automatically.

[Implementation and validation record](work/quo-64-signed-releases.md).
