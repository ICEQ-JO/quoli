import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { usesPackagedRuntime } from "../../bridge/src/install";
import { type CliConfig, installPaths, isWithin, requireRelease } from "./config";
import { serviceStatus } from "./lifecycle";

const MARKER = ".quoli-install.json";
export function ownedInstall(path: string): boolean {
  try {
    return JSON.parse(readFileSync(join(path, MARKER), "utf8")).owner === "quoli-cli-v1";
  } catch {
    return false;
  }
}
function linkExists(path: string) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
export async function installRelease(config: CliConfig) {
  const paths = installPaths();
  requireRelease(config);
  if (existsSync(paths.app) && (!ownedInstall(paths.app) || lstatSync(paths.app).isSymbolicLink()))
    throw new Error(
      "The install directory is not an owned Quoli installation. Nothing was replaced.",
    );
  if (existsSync(paths.app))
    throw new Error(
      "Quoli is already installed. Use quoli update with a signed archive, or explicitly uninstall before a local reinstall.",
    );
  if (
    isWithin(config.dataDir, paths.app) ||
    isWithin(paths.app, config.dataDir) ||
    isWithin(paths.app, config.releaseRoot) ||
    isWithin(config.releaseRoot, paths.app)
  )
    throw new Error("Install, release and evidence directories must not overlap.");
  const binary = join(paths.bin, "quoli");
  if (
    linkExists(binary) &&
    (!lstatSync(binary).isSymbolicLink() ||
      resolve(dirname(binary), readlinkSync(binary)) !== join(paths.app, "cli.mjs"))
  )
    throw new Error("A different quoli command already exists. Nothing was replaced.");
  const status = await serviceStatus(config);
  if (status.status !== "stopped")
    throw new Error("Stop the managed runtime before installing or updating Quoli.");
  if (!existsSync(join(config.releaseRoot, "release.json")))
    throw new Error("A built Quoli release is required.");
  mkdirSync(dirname(paths.app), { recursive: true, mode: 0o700 });
  const stage = `${paths.app}.install-${process.pid}`;
  if (existsSync(stage))
    throw new Error("An unfinished installation needs inspection before retrying.");
  try {
    cpSync(config.releaseRoot, stage, { recursive: true, verbatimSymlinks: true });
    writeFileSync(
      join(stage, MARKER),
      JSON.stringify({ owner: "quoli-cli-v1", node: process.execPath }),
      { mode: 0o600 },
    );
    chmodSync(stage, 0o700);
    chmodSync(join(stage, "cli.mjs"), 0o755);
    mkdirSync(paths.bin, { recursive: true });
    if (!linkExists(binary)) symlinkSync(join(paths.app, "cli.mjs"), binary);
    renameSync(stage, paths.app);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  return binary;
}
export async function uninstallRelease(config: CliConfig) {
  const paths = installPaths();
  requireRelease(config);
  if (!ownedInstall(paths.app) || realpathSync(paths.app) !== realpathSync(config.releaseRoot))
    throw new Error("Run uninstall from the owned installed Quoli command.");
  if ((await serviceStatus(config)).status !== "stopped")
    throw new Error("Run quoli stop before uninstalling. Evidence is preserved.");
  if (existsSync(config.dbFile)) {
    const db = new DatabaseSync(config.dbFile, { readOnly: true });
    try {
      for (const row of db.prepare("SELECT root FROM repositories").all()) {
        if (usesPackagedRuntime(String(row.root), config.releaseRoot))
          throw new Error(
            "This runtime is referenced by installed Quoli hooks or an OpenCode plugin. Remove the integration first; evidence is preserved.",
          );
      }
    } finally {
      db.close();
    }
  }
  const rollback = `${paths.app}.rollback`;
  if (existsSync(rollback) && (!ownedInstall(rollback) || lstatSync(rollback).isSymbolicLink()))
    throw new Error("Rollback directory is not owned; nothing was removed.");
  if (existsSync(paths.unit)) throw new Error("Disable/remove login startup before uninstalling.");
  const binary = join(paths.bin, "quoli");
  if (linkExists(binary)) {
    if (
      !lstatSync(binary).isSymbolicLink() ||
      resolve(dirname(binary), readlinkSync(binary)) !== join(paths.app, "cli.mjs")
    )
      throw new Error("The quoli launcher is no longer owned by this installation.");
    unlinkSync(binary);
  }
  rmSync(paths.app, { recursive: true });
  rmSync(rollback, { recursive: true, force: true });
}
