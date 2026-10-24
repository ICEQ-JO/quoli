import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { releaseVersionSchema, updateJournalSchema } from "../../../packages/schema/src/release";
import { copyReleaseInput, extractRelease } from "./archive";
import { assertDataCompatibility, releaseStorageVersion } from "./compatibility";
import { assertInstallDataSeparation, type CliConfig, installPaths, requireNode } from "./config";
import { ownedInstall } from "./install";
import { serviceStatus } from "./lifecycle";
import { verifyArtifact } from "./release";
import { portAvailable } from "./supervisor";

function paths() {
  const install = installPaths();
  return { ...install, transaction: `${install.app}.update`, rollback: `${install.app}.rollback` };
}
function version(root: string): string {
  return JSON.parse(readFileSync(join(root, "release.json"), "utf8")).version;
}
function ownedDirectory(root: string) {
  if (!ownedInstall(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    throw new Error("Expected an owned Quoli installation; nothing was replaced.");
}
function requireUpdateRuntime() {
  requireNode();
  if (process.arch !== "x64")
    throw new Error("Verified updates and recovery currently support Linux x64 only.");
}
async function stopped(config: CliConfig) {
  if ((await serviceStatus(config)).status !== "stopped")
    throw new Error("Stop the managed runtime before updating, recovering or rolling back Quoli.");
  if (existsSync(paths().unit))
    throw new Error("Disable login startup before updating or rolling back Quoli.");
}
async function preflight(config: CliConfig) {
  requireUpdateRuntime();
  assertInstallDataSeparation(config);
  const p = paths();
  await stopped(config);
  ownedDirectory(p.app);
  assertDataCompatibility(p.app, config.dbFile);
  const binary = join(p.bin, "quoli");
  if (
    !lstatSync(binary).isSymbolicLink() ||
    resolve(dirname(binary), readlinkSync(binary)) !== join(p.app, "cli.mjs")
  )
    throw new Error("The installed launcher is not owned; nothing was replaced.");
  const parent = lstatSync(dirname(p.app));
  if (parent.isSymbolicLink() || parent.uid !== process.getuid?.() || parent.mode & 0o022)
    throw new Error("Update parent directory must be owned and not writable by other users.");
  await portAvailable(config.webPort);
  await portAvailable(config.collectorPort);
}
function journal() {
  const p = paths();
  const stat = lstatSync(p.transaction);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 0o077
  )
    throw new Error("Untrusted update transaction; inspect it without deleting evidence.");
  const file = join(p.transaction, "transaction.json");
  const meta = lstatSync(file);
  if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 4096)
    throw new Error("Invalid update journal");
  return updateJournalSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}
/** Recovery rolls back an interrupted activation, or finishes cleanup after a committed activation. */
export async function recoverUpdate(config: CliConfig, ownProcess = false) {
  requireUpdateRuntime();
  assertInstallDataSeparation(config);
  await stopped(config);
  const p = paths();
  if (!existsSync(p.transaction)) return;
  const record = journal();
  if (!(ownProcess && record.pid === process.pid)) {
    try {
      process.kill(record.pid, 0);
      throw new Error("Update process is still present; recovery did not modify the install.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  const previous = join(p.transaction, "previous");
  if (existsSync(previous)) {
    ownedDirectory(previous);
    if (version(previous) !== record.from) throw new Error("Update recovery version mismatch");
    assertDataCompatibility(previous, config.dbFile);
    if (existsSync(p.app)) {
      ownedDirectory(p.app);
      if (version(p.app) !== record.to)
        throw new Error("Installed release changed during the update");
      renameSync(p.app, join(p.transaction, "rejected"));
    }
    renameSync(previous, p.app);
  }
  ownedDirectory(p.app);
  if (![record.from, record.to].includes(version(p.app)))
    throw new Error("Unrecognized installed release; recovery preserved all copies.");
  assertDataCompatibility(p.app, config.dbFile);
  if (record.operation === "rollback" && !existsSync(p.rollback)) {
    const retained = ["candidate", "rejected"]
      .map((name) => join(p.transaction, name))
      .find(existsSync);
    if (retained) {
      ownedDirectory(retained);
      renameSync(retained, p.rollback);
    }
  }
  const obsolete = join(p.transaction, "obsolete");
  if (existsSync(obsolete) && !existsSync(p.rollback)) renameSync(obsolete, p.rollback);
  finishTransaction();
}
function begin(from: string, to: string, operation: "update" | "rollback" = "update") {
  const p = paths();
  if (existsSync(p.transaction))
    throw new Error(
      "An update transaction exists. Use quoli update recover from a trusted release after its process exits.",
    );
  const reservation = mkdtempSync(`${p.transaction}-reserve-`);
  try {
    writeFileSync(
      join(reservation, "transaction.json"),
      JSON.stringify({ owner: "quoli-update-v1", operation, pid: process.pid, from, to }),
      { mode: 0o600, flag: "wx", flush: true },
    );
    renameSync(reservation, p.transaction);
  } catch (error) {
    rmSync(reservation, { recursive: true, force: true });
    throw error;
  }
  return p;
}
function finishTransaction() {
  const p = paths();
  const cleanup = mkdtempSync(`${p.transaction}-cleanup-`);
  renameSync(p.transaction, cleanup);
  rmSync(cleanup, { recursive: true });
}
function activate(candidate: string) {
  const p = paths();
  ownedDirectory(p.app);
  if (version(p.app) !== journal().from)
    throw new Error(
      "Installed release changed during preparation; retry with its current version.",
    );
  if (existsSync(p.rollback)) {
    ownedDirectory(p.rollback);
    renameSync(p.rollback, join(p.transaction, "obsolete"));
  }
  renameSync(p.app, join(p.transaction, "previous"));
  renameSync(candidate, p.app);
  renameSync(join(p.transaction, "previous"), p.rollback);
  finishTransaction();
}
export async function updateRelease(
  config: CliConfig,
  archive: string,
  publicKey: string,
  expectedVersion: string,
) {
  await preflight(config);
  const current = version(paths().app);
  const oldParts = releaseVersionSchema
    .parse(current.replace(/-local$/, ""))
    .split(".")
    .map(BigInt);
  const nextParts = releaseVersionSchema.parse(expectedVersion).split(".").map(BigInt);
  const different = nextParts.findIndex((value, index) => value !== oldParts[index]);
  if (different < 0 || nextParts[different] < oldParts[different])
    throw new Error(
      "Update requires a newer version. Use explicit rollback for the retained previous release.",
    );
  const p = begin(current, expectedVersion);
  try {
    if (version(p.app) !== current)
      throw new Error("Installed release changed before the update lock was acquired; retry.");
    const snapshot = join(p.transaction, basename(archive));
    // Adjacent metadata is bounded and snapshotted too; no downloaded key is trusted implicitly.
    copyReleaseInput(archive, snapshot);
    copyReleaseInput(`${archive}.manifest.json`, `${snapshot}.manifest.json`, 16384);
    copyReleaseInput(`${archive}.sig`, `${snapshot}.sig`, 4096);
    copyReleaseInput(publicKey, join(p.transaction, "trusted-key.pem"), 16384);
    const { manifest } = await verifyArtifact(
      snapshot,
      join(p.transaction, "trusted-key.pem"),
      expectedVersion,
    );
    if (
      manifest.platform !== process.platform ||
      manifest.arch !== process.arch ||
      manifest.storageVersion === undefined
    )
      throw new Error("Release platform or explicit storage compatibility is unsupported");
    const unpacked = join(p.transaction, "unpacked");
    mkdirSync(unpacked, { mode: 0o700 });
    const candidate = await extractRelease(snapshot, unpacked);
    const metadataFile = join(candidate, "release.json");
    const metadataStat = lstatSync(metadataFile);
    if (!metadataStat.isFile() || metadataStat.isSymbolicLink() || metadataStat.size > 16384)
      throw new Error("Invalid release metadata file");
    const metadata = JSON.parse(readFileSync(metadataFile, "utf8"));
    if (
      metadata.channel !== "signed" ||
      !isDeepStrictEqual(metadata.source, manifest.source) ||
      !isDeepStrictEqual(metadata.toolchain, manifest.toolchain) ||
      metadata.version !== manifest.version ||
      metadata.platform !== manifest.platform ||
      metadata.arch !== manifest.arch ||
      metadata.format !== 1 ||
      metadata.node !== manifest.node ||
      metadata.storageVersion !== manifest.storageVersion ||
      releaseStorageVersion(candidate) !== manifest.storageVersion
    )
      throw new Error("Archive metadata does not match the signed release identity");
    for (const file of [
      "cli.mjs",
      "runtime/supervisor.mjs",
      "runtime/collector.mjs",
      "runtime/web.mjs",
      "web/apps/web/server.js",
    ]) {
      if (
        !lstatSync(join(candidate, file)).isFile() ||
        lstatSync(join(candidate, file)).isSymbolicLink()
      )
        throw new Error("Incomplete release runtime");
    }
    assertDataCompatibility(candidate, config.dbFile);
    writeFileSync(
      join(candidate, ".quoli-install.json"),
      JSON.stringify({ owner: "quoli-cli-v1", node: process.execPath }),
      { mode: 0o600, flag: "wx" },
    );
    chmodSync(candidate, 0o700);
    chmodSync(join(candidate, "cli.mjs"), 0o755);
    await stopped(config);
    activate(candidate);
  } catch (error) {
    try {
      await recoverUpdate(config, true);
    } catch {
      throw new Error(
        "Update could not finish recovery. Evidence was not modified. Run update recover from a trusted release; all retained install copies were preserved.",
      );
    }
    throw error;
  }
}
export async function rollbackRelease(config: CliConfig) {
  await preflight(config);
  const p = paths();
  ownedDirectory(p.rollback);
  assertDataCompatibility(p.rollback, config.dbFile);
  const transaction = begin(version(p.app), version(p.rollback), "rollback");
  try {
    renameSync(p.rollback, join(transaction.transaction, "candidate"));
    activate(join(transaction.transaction, "candidate"));
  } catch (error) {
    try {
      await recoverUpdate(config, true);
    } catch {
      throw new Error(
        "Rollback needs explicit update recover from a trusted release; evidence was not modified.",
      );
    }
    throw error;
  }
}
