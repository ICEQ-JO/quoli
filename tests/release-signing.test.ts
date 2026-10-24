import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  artifactDigest,
  keyFingerprint,
  signingKey,
  signManifest,
  verifyArtifact,
} from "../apps/cli/src/release";
import { releaseManifestSchema } from "../packages/schema/src/release";
import { releaseArchive } from "../scripts/release-archive";
import { releaseSource } from "../scripts/release-source";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "quoli-signature-"));
  const checkout = join(dir, "checkout");
  mkdirSync(checkout);
  const pair = generateKeyPairSync("ed25519");
  const privateFile = join(dir, "private.pem"),
    publicFile = join(dir, "public.pem");
  writeFileSync(privateFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }), {
    mode: 0o600,
  });
  writeFileSync(publicFile, pair.publicKey.export({ format: "pem", type: "spki" }));
  const archive = join(dir, "quoli-0.1.0-linux-x64.tar.gz");
  writeFileSync(archive, "Synthetic inert archive bytes");
  return {
    dir,
    checkout,
    privateFile,
    publicFile,
    archive,
    pair,
    close() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
async function signedFixture(f: ReturnType<typeof fixture>) {
  const manifest = releaseManifestSchema.parse({
    format: 1,
    product: "quoli",
    version: "0.1.0",
    platform: "linux",
    arch: "x64",
    node: ">=24.16.0 <25",
    source: { commit: "a".repeat(40), tag: "v0.1.0", epoch: 1792800000, clean: true },
    toolchain: { node: "24.16.0", pnpm: "11.12.0", lockSha256: "b".repeat(64) },
    archive: { name: "quoli-0.1.0-linux-x64.tar.gz", ...(await artifactDigest(f.archive)) },
  });
  signManifest(f.archive, manifest, signingKey(f.privateFile, f.checkout));
  return manifest;
}

test("signed manifest authenticates archive, source, pinned key and expected version", async () => {
  const f = fixture();
  try {
    const manifest = await signedFixture(f);
    assert.deepEqual((await verifyArtifact(f.archive, f.publicFile, "0.1.0")).manifest, manifest);
    assert.equal(keyFingerprint(f.pair.privateKey), keyFingerprint(f.pair.publicKey));
    const envelope = readFileSync(`${f.archive}.sig`, "utf8");
    signManifest(f.archive, manifest, f.pair.privateKey);
    assert.equal(readFileSync(`${f.archive}.sig`, "utf8"), envelope);
    assert.equal(envelope.includes("PRIVATE KEY"), false);
    await assert.rejects(verifyArtifact(f.archive, f.publicFile, "0.2.0"), /version/);
    const other = generateKeyPairSync("ed25519").publicKey;
    writeFileSync(f.publicFile, other.export({ format: "pem", type: "spki" }));
    await assert.rejects(verifyArtifact(f.archive, f.publicFile, "0.1.0"), /signature|key/);
  } finally {
    f.close();
  }
});

test("tampering with archive, manifest, signature or declared identity fails closed", async () => {
  const f = fixture();
  try {
    const manifest = await signedFixture(f);
    const original = readFileSync(f.archive);
    writeFileSync(f.archive, "Tampered inert archive bytes");
    await assert.rejects(verifyArtifact(f.archive, f.publicFile, "0.1.0"), /checksum/);
    writeFileSync(f.archive, original);
    writeFileSync(`${f.archive}.manifest.json`, JSON.stringify({ ...manifest, version: "0.2.0" }));
    await assert.rejects(verifyArtifact(f.archive, f.publicFile, "0.1.0"), /signature/);
    signManifest(f.archive, manifest, f.pair.privateKey);
    const signature = JSON.parse(readFileSync(`${f.archive}.sig`, "utf8"));
    signature.signature = "0".repeat(128);
    writeFileSync(`${f.archive}.sig`, JSON.stringify(signature));
    await assert.rejects(verifyArtifact(f.archive, f.publicFile, "0.1.0"), /signature/);
    assert.throws(() =>
      signManifest(f.archive, { ...manifest, platform: "darwin" } as never, f.pair.privateKey),
    );
    assert.throws(() =>
      signManifest(
        f.archive,
        { ...manifest, source: { ...manifest.source, tag: "v0.2.0" } },
        f.pair.privateKey,
      ),
    );
  } finally {
    f.close();
  }
});

test("private keys must be owner-only Ed25519 files outside checkout, never symlinks", () => {
  const f = fixture();
  try {
    chmodSync(f.privateFile, 0o644);
    assert.throws(() => signingKey(f.privateFile, f.checkout), /owner-only/);
    chmodSync(f.privateFile, 0o600);
    const inside = join(f.checkout, "private.pem");
    writeFileSync(inside, readFileSync(f.privateFile), { mode: 0o600 });
    assert.throws(() => signingKey(inside, f.checkout), /outside/);
    const link = join(f.dir, "key-link");
    symlinkSync(f.privateFile, link);
    assert.throws(() => signingKey(link, f.checkout));
    writeFileSync(
      f.privateFile,
      generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({
        format: "pem",
        type: "pkcs8",
      }),
    );
    assert.throws(() => signingKey(f.privateFile, f.checkout), /Ed25519/);
    writeFileSync(f.privateFile, "private-sentinel-invalid-key");
    assert.throws(
      () => signingKey(f.privateFile, f.checkout),
      (e) => e instanceof Error && !e.message.includes("sentinel"),
    );
  } finally {
    f.close();
  }
});

test("verification bounds untrusted files, refuses non-regular archives and absent signatures", async () => {
  const f = fixture();
  try {
    await assert.rejects(verifyArtifact(f.archive, f.publicFile, "0.1.0"));
    await signedFixture(f);
    writeFileSync(`${f.archive}.manifest.json`, "x".repeat(16385));
    await assert.rejects(verifyArtifact(f.archive, f.publicFile, "0.1.0"), /size|file/);
    const link = join(f.dir, "archive-link");
    symlinkSync(f.archive, link);
    await assert.rejects(artifactDigest(link));
    await assert.rejects(artifactDigest(f.checkout), /regular/);
    truncateSync(f.archive, 512 * 1024 * 1024 + 1);
    await assert.rejects(artifactDigest(f.archive), /bounded/);
  } finally {
    f.close();
  }
});

test("archive bytes repeat despite timestamps, permissions and ordering noise", async () => {
  const f = fixture();
  try {
    const bundle = join(f.checkout, "quoli");
    mkdirSync(bundle);
    writeFileSync(join(bundle, "z.txt"), "Synthetic Z");
    writeFileSync(join(bundle, "a.txt"), "Synthetic A", { mode: 0o600 });
    symlinkSync("a.txt", join(bundle, "alias"));
    await releaseArchive(bundle, f.archive, 1792800000);
    const before = await artifactDigest(f.archive);
    utimesSync(join(bundle, "a.txt"), new Date(), new Date());
    chmodSync(join(bundle, "a.txt"), 0o644);
    utimesSync(bundle, new Date(), new Date());
    await releaseArchive(bundle, f.archive, 1792800000);
    assert.deepEqual(await artifactDigest(f.archive), before);
  } finally {
    f.close();
  }
});

test("signed source requires clean matching version tag and rejects ignored environment files", () => {
  const f = fixture();
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: f.checkout,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "ICEQ-JO",
        GIT_AUTHOR_EMAIL: "151853839+ICEQ-JO@users.noreply.github.com",
        GIT_COMMITTER_NAME: "ICEQ-JO",
        GIT_COMMITTER_EMAIL: "151853839+ICEQ-JO@users.noreply.github.com",
      },
      stdio: "pipe",
    });
  try {
    git("init", "--quiet");
    writeFileSync(
      join(f.checkout, "package.json"),
      JSON.stringify({ version: "0.1.0", packageManager: "pnpm@11.12.0" }),
    );
    writeFileSync(join(f.checkout, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    writeFileSync(join(f.checkout, ".gitignore"), ".env\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "Synthetic release fixture");
    assert.throws(() => releaseSource(f.checkout, true), /tag/);
    git("tag", "v0.1.0");
    assert.equal(releaseSource(f.checkout, true).version, "0.1.0");
    writeFileSync(join(f.checkout, ".env"), "SYNTHETIC_UNUSED=fixture\n");
    assert.throws(() => releaseSource(f.checkout, true), /environment/);
    rmSync(join(f.checkout, ".env"));
    writeFileSync(join(f.checkout, "untracked.txt"), "Synthetic");
    assert.throws(() => releaseSource(f.checkout, true), /clean/);
    assert.equal(releaseSource(f.checkout, false).version, "0.1.0-local");
  } finally {
    f.close();
  }
});
