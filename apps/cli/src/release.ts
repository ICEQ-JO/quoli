import {
  createHash,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
  sign,
  verify,
} from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { open } from "node:fs/promises";
import { basename, relative } from "node:path";
import {
  type ReleaseManifest,
  releaseManifestSchema,
  releaseSignatureSchema,
  releaseVersionSchema,
} from "../../../packages/schema/src/release";

const domain = Buffer.from("quoli-release-manifest/v1\n");
function readBounded(path: string, limit: number, privateFile = false): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.size > limit ||
      (privateFile && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))
    )
      throw new Error("Invalid release input file");
    const data = Buffer.alloc(limit + 1);
    let size = 0,
      read = 0;
    do {
      read = readSync(fd, data, size, data.length - size, null);
      size += read;
    } while (read && size <= limit);
    if (size > limit) throw new Error("Release input exceeds size limit");
    return data.subarray(0, size);
  } finally {
    closeSync(fd);
  }
}
export function signingKey(path: string, checkout: string): KeyObject {
  try {
    const inside = relative(realpathSync(checkout), realpathSync(path));
    if (!inside || (!inside.startsWith("../") && inside !== ".."))
      throw new Error("Key inside checkout");
    const key = createPrivateKey(readBounded(path, 16384, true));
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Wrong signing algorithm");
    return key;
  } catch {
    throw new Error(
      "Signing requires an owner-only Ed25519 private key file outside the checkout.",
    );
  }
}
export function keyFingerprint(key: KeyObject): string {
  const publicKey = key.type === "public" ? key : createPublicKey(key);
  return createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest("hex");
}
export async function artifactDigest(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 512 * 1024 * 1024)
      throw new Error("Archive must be a bounded regular file");
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      bytes += chunk.length;
      if (bytes > 512 * 1024 * 1024) throw new Error("Archive exceeds size limit");
      hash.update(chunk);
    }
    return { bytes, sha256: hash.digest("hex") };
  } finally {
    await file.close();
  }
}
export function signManifest(archive: string, manifest: ReleaseManifest, key: KeyObject) {
  const checked = releaseManifestSchema.parse(manifest);
  if (key.asymmetricKeyType !== "ed25519" || key.type !== "private")
    throw new Error("Ed25519 private key required");
  const data = Buffer.from(`${JSON.stringify(checked, null, 2)}\n`);
  const signature = {
    format: 1,
    algorithm: "Ed25519",
    keyId: keyFingerprint(key),
    signature: sign(null, Buffer.concat([domain, data]), key).toString("hex"),
  };
  writeFileSync(`${archive}.manifest.json`, data);
  writeFileSync(`${archive}.sig`, `${JSON.stringify(signature, null, 2)}\n`);
}
/** Checks a caller-pinned key and version before reading archive bytes; never extracts or executes. */
export async function verifyArtifact(
  archive: string,
  publicKeyFile: string,
  expectedVersion: string,
) {
  const version = releaseVersionSchema.parse(expectedVersion);
  const data = readBounded(`${archive}.manifest.json`, 16384);
  const envelope = releaseSignatureSchema.parse(
    JSON.parse(readBounded(`${archive}.sig`, 4096).toString("utf8")),
  );
  const key = createPublicKey(readBounded(publicKeyFile, 16384));
  if (
    key.asymmetricKeyType !== "ed25519" ||
    keyFingerprint(key) !== envelope.keyId ||
    !verify(null, Buffer.concat([domain, data]), key, Buffer.from(envelope.signature, "hex"))
  )
    throw new Error("Release signature or trusted key mismatch");
  const manifest = releaseManifestSchema.parse(JSON.parse(data.toString("utf8")));
  if (manifest.version !== version || manifest.archive.name !== basename(archive))
    throw new Error("Unexpected release version or archive name");
  const actual = await artifactDigest(archive);
  if (actual.bytes !== manifest.archive.bytes || actual.sha256 !== manifest.archive.sha256)
    throw new Error("Release archive checksum mismatch");
  return { manifest, keyId: envelope.keyId };
}
