import { chmodSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { runtime } from "../../../packages/storage/src/runtime";

export const RELEASE_FORMAT = 1;
export function requireNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 24 || minor < 16)
    throw new Error("Quoli requires Node 24.16 or newer within Node 24.");
  if (process.platform !== "linux")
    throw new Error("This local Quoli release currently supports Linux only.");
}
export function cliConfig(releaseRoot: string) {
  const config = runtime();
  return {
    ...config,
    releaseRoot: resolve(releaseRoot),
    stateFile: join(config.dataDir, "quoli-service.json"),
    logFile: join(config.dataDir, "quoli-service.log"),
    url: `http://127.0.0.1:${config.webPort}`,
  };
}
export type CliConfig = ReturnType<typeof cliConfig>;
export function installPaths() {
  const base = process.env.XDG_DATA_HOME || join(homedir(), ".local/share");
  return {
    app: resolve(process.env.QUOLI_INSTALL_DIR || join(base, "quoli/app")),
    bin: resolve(process.env.QUOLI_BIN_DIR || join(homedir(), ".local/bin")),
    unit: join(
      process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
      "systemd/user/quoli.service",
    ),
  };
}
export function privateDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}
export function childEnvironment(config: CliConfig) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TRACEFRAME_DATA_DIR: config.dataDir,
    TRACEFRAME_WEB_PORT: String(config.webPort),
    TRACEFRAME_COLLECTOR_PORT: String(config.collectorPort),
    QUOLI_RUNTIME_ROOT: config.releaseRoot,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  return env;
}
function canonicalPath(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = dirname(absolute);
    if (parent === absolute) throw error;
    return join(canonicalPath(parent), basename(absolute));
  }
}
export function isWithin(path: string, root: string) {
  const value = canonicalPath(path),
    parent = canonicalPath(root);
  return value === parent || value.startsWith(parent.endsWith("/") ? parent : `${parent}/`);
}
export function requireRelease(config: CliConfig) {
  if (isWithin(config.dataDir, config.releaseRoot) || isWithin(config.releaseRoot, config.dataDir))
    throw new Error("The runtime installation and private evidence directory must not overlap.");
  const release = JSON.parse(readFileSync(join(config.releaseRoot, "release.json"), "utf8"));
  if (
    release.format !== 1 ||
    release.platform !== process.platform ||
    release.arch !== process.arch
  )
    throw new Error("This Quoli release does not match the current platform/architecture.");
}

export function connectArguments(args: string[], cwd: string) {
  const { positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      name: { type: "string" },
      agent: { type: "string" },
      "capture-code": { type: "boolean" },
      "include-untracked": { type: "boolean" },
      telemetry: { type: "boolean" },
      check: { type: "boolean" },
      disable: { type: "boolean" },
      undo: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  return positionals.length ? args : [cwd, ...args];
}
