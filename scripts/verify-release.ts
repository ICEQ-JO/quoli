#!/usr/bin/env node
import { verifyArtifact } from "../apps/cli/src/release";

try {
  const [archive, key, version, extra] = process.argv.slice(2);
  if (!archive || !key || !version || extra)
    throw new Error("Use: node verify-release.mjs ARCHIVE TRUSTED_PUBLIC_KEY EXPECTED_VERSION");
  const result = await verifyArtifact(archive, key, version);
  console.log(
    `Verified Quoli ${result.manifest.version} ${result.manifest.platform}/${result.manifest.arch}; key SHA-256 ${result.keyId}; source ${result.manifest.source.commit}`,
  );
} catch {
  console.error(
    "Release verification failed. Check the archive, signed manifest, signature, independently trusted public key and expected version. Nothing was extracted or executed.",
  );
  process.exitCode = 1;
}
