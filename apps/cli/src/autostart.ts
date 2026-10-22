import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { type CliConfig, installPaths } from "./config";
import { ownedInstall } from "./install";
import { serviceStatus, stopService } from "./lifecycle";

const OWNER = "# Managed by Quoli CLI v1";
function unitQuote(value: string, executable = false) {
  if (executable && value.includes("$"))
    throw new Error("Login startup requires an installation path without dollar signs.");
  if (/[\n\r\0]/.test(value)) throw new Error("Service paths cannot contain line breaks or NUL.");
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
}
export function systemdUnit(config: CliConfig) {
  return `${OWNER}\n[Unit]\nDescription=Quoli local repository observer\n\n[Service]\nType=exec\nExecStart=${unitQuote(process.execPath, true)} ${unitQuote(join(config.releaseRoot, "cli.mjs"), true)} serve\nEnvironment=${unitQuote(`TRACEFRAME_DATA_DIR=${config.dataDir}`)}\nEnvironment=${unitQuote(`TRACEFRAME_WEB_PORT=${config.webPort}`)}\nEnvironment=${unitQuote(`TRACEFRAME_COLLECTOR_PORT=${config.collectorPort}`)}\nRestart=on-failure\nRestartSec=5\nKillMode=control-group\nTimeoutStopSec=15\nUMask=0077\n\n[Install]\nWantedBy=default.target\n`;
}
function systemctl(args: string[], capture = false) {
  const executable = ["/usr/bin/systemctl", "/bin/systemctl"].find((path) => existsSync(path));
  if (!executable)
    throw new Error("systemd user services are unavailable. Use quoli start/stop manually.");
  return execFileSync(executable, ["--user", ...args], {
    encoding: "utf8",
    timeout: 20000,
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
  });
}
export async function autostart(config: CliConfig, action: string) {
  if (process.platform !== "linux")
    throw new Error(
      "Login startup is currently supported only on Linux with systemd user services.",
    );
  const { unit } = installPaths();
  if (action === "status") {
    if (!existsSync(unit)) {
      console.log("Login startup is not configured.");
      return;
    }
    if (!readFileSync(unit, "utf8").startsWith(OWNER))
      throw new Error("An unrelated quoli.service exists; it was not changed.");
    console.log("An owned login-startup unit is configured.");
    systemctl(["is-enabled", "quoli.service"]);
    return;
  }
  if (!["enable", "disable"].includes(action))
    throw new Error("Use quoli autostart enable|disable|status.");
  if (existsSync(unit) && !readFileSync(unit, "utf8").startsWith(OWNER))
    throw new Error("An unrelated quoli.service exists; it was not changed.");
  // Check the user bus before changing files or stopping an existing instance.
  try {
    systemctl(["show-environment"], true);
  } catch {
    throw new Error(
      "The systemd user bus is unavailable. No login-startup configuration was changed; use quoli start/stop.",
    );
  }
  if (action === "enable") {
    if (!ownedInstall(config.releaseRoot))
      throw new Error("Install Quoli before enabling login startup.");
    const content = systemdUnit(config);
    const status = await serviceStatus(config);
    if (status.status === "unverified")
      throw new Error("Service state is unverified; login startup was not changed.");
    if (status.status === "managed") await stopService(config);
    mkdirSync(dirname(unit), { recursive: true, mode: 0o700 });
    writeFileSync(unit, content, { mode: 0o600 });
    systemctl(["daemon-reload"]);
    systemctl(["enable", "--now", "quoli.service"]);
    console.log(
      "Quoli will start at user login. No system-wide service or shell profile was changed.",
    );
  } else {
    if (!existsSync(unit)) {
      console.log("Login startup is not configured.");
      return;
    }
    systemctl(["disable", "--now", "quoli.service"]);
    unlinkSync(unit);
    systemctl(["daemon-reload"]);
    console.log("Login startup removed. Retained evidence is unchanged.");
  }
}

/** Route lifecycle commands through an explicitly configured login service. */
export async function loginLifecycle(config: CliConfig, action: "start" | "stop" | "restart") {
  const { unit } = installPaths();
  if (!existsSync(unit) || !readFileSync(unit, "utf8").startsWith(OWNER)) return false;
  if (readFileSync(unit, "utf8") !== systemdUnit(config))
    throw new Error(
      "Login startup uses different installation/configuration. Use the installed command with matching data-directory and port overrides.",
    );
  systemctl([action, "quoli.service"]);
  for (let n = 0; n < 150; n++) {
    const current = await serviceStatus(config);
    if (
      action === "stop"
        ? current.status === "stopped"
        : current.status === "managed" && current.health.phase === "ready"
    )
      return true;
    await delay(100);
  }
  throw new Error(
    "The login service did not reach the requested state. Inspect quoli status and the systemd user journal.",
  );
}
