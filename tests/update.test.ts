import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { assertDataCompatibility } from "../apps/cli/src/compatibility";
import { assertInstallDataSeparation, cliConfig, requireRelease } from "../apps/cli/src/config";
import { artifactDigest, signManifest } from "../apps/cli/src/release";
import { recoverUpdate, rollbackRelease, updateRelease } from "../apps/cli/src/update";
import { releaseManifestSchema } from "../packages/schema/src/release";
import { releaseArchive } from "../scripts/release-archive";

const runtimeFiles = [
  "cli.mjs",
  "runtime/supervisor.mjs",
  "runtime/collector.mjs",
  "runtime/web.mjs",
  "web/apps/web/server.js",
];
function metadata(version: string, storageVersion: number) {
  return {
    format: 1,
    version,
    storageVersion,
    platform: "linux",
    arch: "x64",
    node: ">=24.16.0 <25",
    channel: "signed",
    source: { commit: "a".repeat(40), tag: `v${version}`, epoch: 1792800000, clean: true },
    toolchain: { node: "24.16.0", pnpm: "11.12.0", lockSha256: "b".repeat(64) },
  };
}
function release(root: string, version: string, storageVersion: number) {
  for (const file of runtimeFiles) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(
      join(root, file),
      'throw new Error("Candidate must not execute during update");\n',
    );
  }
  mkdirSync(join(root, "migrations"));
  for (let n = 1; n <= storageVersion; n++)
    writeFileSync(
      join(root, "migrations", `${String(n).padStart(3, "0")}-synthetic.sql`),
      "-- Synthetic migration\n",
    );
  writeFileSync(join(root, "release.json"), JSON.stringify(metadata(version, storageVersion)));
}
function fixture(oldSchema = 5) {
  const base = mkdtempSync(join(tmpdir(), "quoli-update-"));
  const app = join(base, "app"),
    bin = join(base, "bin"),
    data = join(base, "data"),
    unpacked = join(base, "quoli");
  const saved = { ...process.env };
  Object.assign(process.env, {
    QUOLI_INSTALL_DIR: app,
    QUOLI_BIN_DIR: bin,
    XDG_CONFIG_HOME: join(base, "config"),
    TRACEFRAME_DATA_DIR: data,
    TRACEFRAME_WEB_PORT: "39871",
    TRACEFRAME_COLLECTOR_PORT: "39872",
  });
  release(app, "0.1.0", oldSchema);
  writeFileSync(join(app, ".quoli-install.json"), JSON.stringify({ owner: "quoli-cli-v1" }));
  mkdirSync(bin);
  symlinkSync(join(app, "cli.mjs"), join(bin, "quoli"));
  mkdirSync(data);
  const config = cliConfig(app);
  const db = new DatabaseSync(config.dbFile);
  db.exec(
    "CREATE TABLE migrations(version INTEGER PRIMARY KEY); CREATE TABLE evidence(body TEXT);",
  );
  for (let n = 1; n <= oldSchema; n++) db.prepare("INSERT INTO migrations VALUES(?)").run(n);
  db.prepare("INSERT INTO evidence VALUES(?)").run(
    '{"synthetic":true,"schemaVersion":1,"text":"inert evidence"}',
  );
  db.close();
  release(unpacked, "0.2.0", 5);
  const pair = generateKeyPairSync("ed25519");
  const key = join(base, "public.pem");
  writeFileSync(key, pair.publicKey.export({ format: "pem", type: "spki" }));
  const archive = join(base, "quoli-0.2.0-linux-x64.tar.gz");
  const digest = () => createHash("sha256").update(readFileSync(config.dbFile)).digest("hex");
  const original = digest();
  const installed = () => JSON.parse(readFileSync(join(app, "release.json"), "utf8")).version;
  const sign = async () => {
    const { channel: _channel, ...m } = metadata("0.2.0", 5);
    signManifest(
      archive,
      releaseManifestSchema.parse({
        ...m,
        product: "quoli",
        storageVersion: 5,
        archive: { name: "quoli-0.2.0-linux-x64.tar.gz", ...(await artifactDigest(archive)) },
      }),
      pair.privateKey,
    );
  };
  return {
    base,
    app,
    data,
    bin,
    unpacked,
    archive,
    key,
    config,
    original,
    digest,
    installed,
    sign,
    async pack() {
      await releaseArchive(unpacked, archive, 1792800000);
      await sign();
    },
    close() {
      rmSync(base, { recursive: true, force: true });
      process.env = saved;
    },
  };
}

function tar(entries: { path: string; type?: string; link?: string; body?: string }[]) {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512),
      body = Buffer.from(entry.body ?? "");
    header.write(entry.path, 0);
    header.write("0000644\0", 100);
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
    header.fill(32, 148, 156);
    header.write(entry.type ?? "0", 156);
    header.write(entry.link ?? "", 157);
    header.write("ustar\0", 257);
    const checksum = header.reduce((sum, n) => sum + n, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
    chunks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

function paxRecord(key: string, value: string) {
  const record = `${key}=${value}\n`;
  let length = Buffer.byteLength(record) + 2;
  while (length !== Buffer.byteLength(`${length} ${record}`))
    length = Buffer.byteLength(`${length} ${record}`);
  return `${length} ${record}`;
}

test("verified update and explicit rollback preserve exact retained bytes without executing candidate code", async () => {
  const f = fixture();
  try {
    const long = join(f.unpacked, "web", "x".repeat(130));
    mkdirSync(long);
    writeFileSync(join(long, "file.js"), "synthetic");
    symlinkSync(`${"x".repeat(130)}/file.js`, join(f.unpacked, "web", "linked.js"));
    await f.pack();
    await updateRelease(f.config, f.archive, f.key, "0.2.0");
    assert.equal(f.installed(), "0.2.0");
    assert.equal(f.digest(), f.original);
    assert.equal(existsSync(`${f.app}.rollback`), true);
    assert.equal(readFileSync(join(f.app, "web/linked.js"), "utf8"), "synthetic");
    await rollbackRelease(f.config);
    assert.equal(f.installed(), "0.1.0");
    assert.equal(f.digest(), f.original);
    assert.equal(existsSync(`${f.app}.update`), false);
    symlinkSync("release.json", join(f.unpacked, ".quoli-install.json"));
    await f.pack();
    await assert.rejects(updateRelease(f.config, f.archive, f.key, "0.2.0"), /EEXIST/);
    assert.equal(f.installed(), "0.1.0");
    assert.equal(f.digest(), f.original);
  } finally {
    f.close();
  }
});

test("verification, metadata, downgrade, storage and port failures leave the install untouched", async () => {
  const f = fixture();
  try {
    await f.pack();
    const valid = readFileSync(f.archive);
    writeFileSync(f.archive, Buffer.concat([valid, Buffer.from("tampered")]));
    await assert.rejects(updateRelease(f.config, f.archive, f.key, "0.2.0"), /checksum/);
    writeFileSync(f.archive, valid);
    await assert.rejects(updateRelease(f.config, f.archive, f.key, "0.1.0"), /newer/);
    await assert.rejects(updateRelease(f.config, f.archive, f.key, "0.3.0"), /version/);
    // Omit the explicit storage version from a historically valid signature.
    const manifest = JSON.parse(readFileSync(`${f.archive}.manifest.json`, "utf8"));
    delete manifest.storageVersion;
    const pair = generateKeyPairSync("ed25519");
    const key = join(f.base, "second.pem");
    writeFileSync(key, pair.publicKey.export({ type: "spki", format: "pem" }));
    signManifest(f.archive, manifest, pair.privateKey);
    await assert.rejects(updateRelease(f.config, f.archive, key, "0.2.0"), /storage/);
    await f.pack();
    writeFileSync(
      join(f.unpacked, "release.json"),
      JSON.stringify({ ...metadata("0.2.0", 5), arch: "arm64" }),
    );
    await f.pack();
    await assert.rejects(updateRelease(f.config, f.archive, f.key, "0.2.0"), /identity/);
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(f.config.webPort, "127.0.0.1", resolve));
    try {
      await assert.rejects(updateRelease(f.config, f.archive, f.key, "0.2.0"), /busy|use|port/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    assert.equal(f.installed(), "0.1.0");
    assert.equal(f.digest(), f.original);
    assert.equal(existsSync(`${f.app}.update`), false);
  } finally {
    f.close();
  }
});

test("a database upgraded by newer code cannot be rolled backward", async () => {
  const f = fixture(4);
  try {
    await f.pack();
    await updateRelease(f.config, f.archive, f.key, "0.2.0");
    const db = new DatabaseSync(f.config.dbFile);
    db.exec("INSERT INTO migrations VALUES(5)");
    db.close();
    const after = f.digest();
    await assert.rejects(rollbackRelease(f.config), /newer|downgrade/);
    assert.throws(
      () => assertDataCompatibility(`${f.app}.rollback`, f.config.dbFile),
      /newer|downgrade/,
    );
    assert.throws(
      () => requireRelease({ ...f.config, releaseRoot: `${f.app}.rollback` }),
      /newer|downgrade/,
    );
    assert.equal(f.installed(), "0.2.0");
    assert.equal(f.digest(), after);
    assert.ok(existsSync(`${f.app}.rollback`));
  } finally {
    f.close();
  }
});

test("signed hostile archive paths, duplicate members, symlinks and special files never escape staging", async () => {
  const f = fixture();
  try {
    for (const entries of [
      [{ path: "../escaped", body: "bad" }],
      [{ path: "/tmp/escaped", body: "bad" }],
      [{ path: "quoli/link", type: "2", link: "../../escaped" }],
      [
        { path: "quoli/link", type: "2", link: "file" },
        { path: "quoli/link/child", body: "bad" },
      ],
      [
        { path: "quoli/file", body: "a" },
        { path: "quoli/file", body: "b" },
      ],
      [{ path: "quoli/device", type: "3" }],
      [{ path: "quoli/hard", type: "1", link: "../outside" }],
      [
        { path: "quoli/PaxHeaders/file", type: "x", body: paxRecord("path", "../escaped") },
        { path: "quoli/file", body: "bad" },
      ],
      [
        { path: "quoli/PaxHeaders/link", type: "x", body: paxRecord("linkpath", "../../escaped") },
        { path: "quoli/link", type: "2", link: "file" },
      ],
      [
        { path: "quoli/PaxHeaders/file", type: "x", body: paxRecord("size", "100") },
        { path: "quoli/file", body: "bad" },
      ],
      [{ path: "quoli/PaxHeaders/file", type: "x", body: "x".repeat(16385) }],
    ]) {
      writeFileSync(f.archive, tar(entries));
      await f.sign();
      await assert.rejects(
        updateRelease(f.config, f.archive, f.key, "0.2.0"),
        /archive|symlink|member|parent|header|PAX/i,
      );
      assert.equal(f.installed(), "0.1.0");
      assert.equal(f.digest(), f.original);
      assert.equal(existsSync(`${f.app}.update`), false);
    }
    const validTar = gunzipSync(tar([{ path: "quoli/file", body: "text" }]));
    const corrupt = Buffer.from(validTar);
    corrupt[0] ^= 1;
    for (const invalid of [
      gzipSync(corrupt),
      gzipSync(validTar.subarray(0, -512)),
      Buffer.from("not gzip"),
    ]) {
      writeFileSync(f.archive, invalid);
      await f.sign();
      await assert.rejects(updateRelease(f.config, f.archive, f.key, "0.2.0"));
      assert.equal(f.installed(), "0.1.0");
      assert.equal(f.digest(), f.original);
    }
    assert.equal(existsSync(join(f.base, "escaped")), false);
  } finally {
    f.close();
  }
});

test("update state and evidence cannot overlap; active or untrusted transaction recovery is refused", async () => {
  const f = fixture();
  try {
    const architecture = Object.getOwnPropertyDescriptor(process, "arch");
    assert.ok(architecture);
    try {
      Object.defineProperty(process, "arch", { value: "arm64", configurable: true });
      await assert.rejects(recoverUpdate(f.config), /Linux x64/);
    } finally {
      Object.defineProperty(process, "arch", architecture);
    }
    for (const suffix of ["", ".update", ".rollback"])
      assert.throws(
        () => assertInstallDataSeparation({ ...f.config, dataDir: `${f.app}${suffix}` }),
        /overlap/,
      );
    mkdirSync(`${f.app}.update`, { mode: 0o700 });
    writeFileSync(
      `${f.app}.update/transaction.json`,
      JSON.stringify({
        owner: "quoli-update-v1",
        operation: "update",
        pid: process.pid,
        from: "0.1.0",
        to: "0.2.0",
      }),
    );
    await assert.rejects(recoverUpdate(f.config), /still present/);
    assert.throws(() => requireRelease(f.config), /interrupted update/);
    writeFileSync(`${f.app}.update/transaction.json`, JSON.stringify({ owner: "other" }));
    await assert.rejects(recoverUpdate(f.config));
    assert.equal(existsSync(`${f.app}.update`), true);
    assert.equal(f.installed(), "0.1.0");
    assert.equal(f.digest(), f.original);
  } finally {
    f.close();
  }
});

test("process interruption recovers before and between every activation rename", async () => {
  for (const phase of [
    "prepare",
    "extract",
    "move-old",
    "activate",
    "commit",
    "cleanup",
    "rollback-prepare",
    "rollback-move-old",
    "rollback-activate",
  ]) {
    const f = fixture();
    try {
      await f.pack();
      const rollingBack = phase.startsWith("rollback");
      if (rollingBack) await updateRelease(f.config, f.archive, f.key, "0.2.0");
      const script = `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
        const rename = fs.renameSync; const mkdir = fs.mkdirSync; const phase=${JSON.stringify(phase)}; const app=${JSON.stringify(f.app)};
        fs.renameSync=(from,to)=>{const result=rename(from,to); if ((phase==='prepare'&&to===app+'.update')||(phase.endsWith('move-old')&&to===app+'.update/previous')||(phase.endsWith('activate')&&to===app)||(phase==='commit'&&to===app+'.rollback')||(phase==='cleanup'&&to.includes('.update-cleanup-'))||(phase==='rollback-prepare'&&to===app+'.update/candidate')) process.exit(73); return result;};
        fs.mkdirSync=(path,...args)=>{const result=mkdir(path,...args); if(phase==='extract'&&path===app+'.update/unpacked')process.exit(73);return result;}; syncBuiltinESMExports();
        const {cliConfig}=await import(${JSON.stringify(pathToFileURL(resolve("apps/cli/src/config.ts")).href)});
        const {updateRelease,rollbackRelease}=await import(${JSON.stringify(pathToFileURL(resolve("apps/cli/src/update.ts")).href)});
        ${rollingBack ? "await rollbackRelease(cliConfig(app));" : `await updateRelease(cliConfig(app),${JSON.stringify(f.archive)},${JSON.stringify(f.key)},'0.2.0');`}`;
      assert.throws(
        () =>
          execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
            env: process.env,
            stdio: "pipe",
          }),
        (error: unknown) => (error as { status: number }).status === 73,
        phase,
      );
      await recoverUpdate(f.config);
      assert.equal(
        f.installed(),
        ["commit", "cleanup"].includes(phase) || rollingBack ? "0.2.0" : "0.1.0",
        phase,
      );
      if (rollingBack)
        assert.equal(
          JSON.parse(readFileSync(`${f.app}.rollback/release.json`, "utf8")).version,
          "0.1.0",
          phase,
        );
      assert.equal(f.digest(), f.original, phase);
      assert.equal(existsSync(`${f.app}.update`), false, phase);
    } finally {
      f.close();
    }
  }
});
