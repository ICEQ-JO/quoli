import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { type CliConfig, childEnvironment, privateDirectory, requireRelease } from "./config";
import { control, identify, readState, removeState, type ServiceState } from "./control";

function recordedProcessIsGone(state: ServiceState) {
  if (!state.pid) return false;
  try {
    process.kill(state.pid, 0);
    try {
      const stat = readFileSync(`/proc/${state.pid}/stat`, "utf8");
      return stat.slice(stat.lastIndexOf(")") + 2).startsWith("Z ");
    } catch {
      return false;
    }
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

export async function serviceStatus(config: CliConfig) {
  const state = readState(config);
  if (!state) return { status: "stopped" as const };
  if (!(await identify(state))) return { status: "unverified" as const, state };
  return { status: "managed" as const, state, health: await control(state, "status") };
}
export async function stopService(config: CliConfig) {
  const current = await serviceStatus(config);
  if (current.status === "stopped") return;
  if (current.status === "unverified")
    throw new Error(
      "Saved service state cannot be authenticated. No process was signalled; use quoli status to diagnose it.",
    );
  await control(current.state, "stop");
  for (let n = 0; n < 100; n++) {
    if (readState(config)?.instance !== current.state.instance) return;
    await delay(100);
  }
  throw new Error("Quoli is still stopping. Inspect the private service log.");
}
export async function startService(
  config: CliConfig,
  foreground = false,
): Promise<ChildProcess | null> {
  if (!existsSync(join(config.releaseRoot, "release.json")))
    throw new Error("Build or unpack a Quoli release before starting the managed runtime.");
  requireRelease(config);
  privateDirectory(config.dataDir);
  for (let attempt = 0; attempt < 300; attempt++) {
    const previous = readState(config);
    if (previous) {
      if (await identify(previous)) {
        const health = await control(previous, "status");
        if (previous.webPort !== config.webPort || previous.collectorPort !== config.collectorPort)
          throw new Error(
            "Quoli is already running with different ports. Stop it before changing configuration.",
          );
        if (health.phase === "ready") {
          if (foreground)
            throw new Error(
              "A managed background instance is already running. Stop it before starting a foreground service.",
            );
          return null;
        }
      } else if (
        recordedProcessIsGone(previous) ||
        Date.now() - Date.parse(previous.startedAt) > 60000
      ) {
        // Reclaim only the unchanged stale reservation. A PID is never used to
        // identify or terminate a process, even when an old file contains one.
        if (JSON.stringify(readState(config)) === JSON.stringify(previous))
          removeState(config, previous.instance);
        continue;
      }
      await delay(100);
      continue;
    }
    const state: ServiceState = {
      format: 1,
      instance: randomBytes(16).toString("hex"),
      token: randomBytes(32).toString("hex"),
      pid: 0,
      controlPort: 0,
      startedAt: new Date().toISOString(),
      releaseRoot: config.releaseRoot,
      webPort: config.webPort,
      collectorPort: config.collectorPort,
    };
    try {
      writeFileSync(config.stateFile, JSON.stringify(state), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    if (existsSync(config.logFile) && statSync(config.logFile).size > 5 * 1024 * 1024)
      renameSync(config.logFile, `${config.logFile}.1`);
    const log = openSync(config.logFile, "a", 0o600);
    let child: ChildProcess;
    try {
      child = spawn(process.execPath, [join(config.releaseRoot, "runtime/supervisor.mjs")], {
        cwd: config.releaseRoot,
        detached: !foreground,
        env: { ...childEnvironment(config), QUOLI_SERVICE_INSTANCE: state.instance },
        stdio: ["ignore", log, log],
      });
      child.once("error", () => removeState(config, state.instance));
    } finally {
      closeSync(log);
    }
    if (!foreground) child.unref();
    for (let n = 0; n < 300; n++) {
      const saved = readState(config);
      if (!saved || saved.instance !== state.instance || child.exitCode !== null)
        throw new Error(
          `Quoli could not start. Inspect ${config.logFile}; port conflicts do not stop other software.`,
        );
      if ((await identify(saved)) && (await control(saved, "status")).phase === "ready")
        return child;
      await delay(100);
    }
    const saved = readState(config);
    if (saved?.instance === state.instance && (await identify(saved))) await control(saved, "stop");
    throw new Error(`Quoli startup timed out. Inspect ${config.logFile}.`);
  }
  throw new Error(
    "Another startup is in progress or saved service state is unverified. Wait a minute, then retry quoli status/start.",
  );
}
