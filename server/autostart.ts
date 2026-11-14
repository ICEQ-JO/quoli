import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { installSyncCommand } from "./background.ts";
import { home } from "./db.ts";

/**
 * Quoli in the background (#199): the website (app.iceq.best) reads Quoli on this computer, so it
 * has to be running. `quoli` installs it as a login item of the user's own session (no admin
 * rights): a systemd user service on Linux, a LaunchAgent on macOS, a hidden script in the Startup
 * folder on Windows. It runs the app copy in `~/.quoli/app` (server/background.ts), with the
 * update check off; running `quoli` again updates the copy and restarts it.
 */

export type AutostartKind = "systemd" | "launchd" | "startup";

export interface AutostartPlan {
  kind: AutostartKind;
  file: string;
  content: string;
}

/** The service name; QUOLI_SERVICE_NAME lets a test install a second one beside the real one. */
const name = () => process.env.QUOLI_SERVICE_NAME ?? "quoli";
const label = () => `best.iceq.${name()}`;
const port = () => Number(process.env.QUOLI_PORT ?? 4400);
const app = () => join(home(), "app");
const entry = () => join(app(), "server", "cli.mjs");

/** What the service passes on: the port and Quoli home when they differ from the defaults. */
export function serviceEnv(): Record<string, string> {
  const env: Record<string, string> = { NODE_ENV: "production", QUOLI_NO_UPDATE_CHECK: "1" };
  if (process.env.QUOLI_PORT) env.QUOLI_PORT = process.env.QUOLI_PORT;
  if (process.env.QUOLI_HOME) env.QUOLI_HOME = process.env.QUOLI_HOME;
  return env;
}

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** systemd: `%` starts a specifier; quotes allow spaces in ExecStart and Environment only. */
const unitText = (s: string) => s.replace(/%/g, "%%");
const unitQuote = (s: string) => `"${unitText(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const vbs = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** The login item for this operating system, or null where Quoli has none. */
export function autostartPlan(
  platform: NodeJS.Platform = process.platform,
  node = process.execPath,
): AutostartPlan | null {
  const env = serviceEnv();
  if (platform === "linux") {
    const config = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return {
      kind: "systemd",
      file: join(config, "systemd", "user", `${name()}.service`),
      content: `[Unit]
Description=Quoli: records coding agent sessions; app.iceq.best reads it

[Service]
ExecStart=${unitQuote(node)} ${unitQuote(entry())} start
WorkingDirectory=${unitText(app())}
${Object.entries(env)
  .map(([k, v]) => `Environment=${unitQuote(`${k}=${v}`)}`)
  .join("\n")}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`,
    };
  }
  if (platform === "darwin") {
    const log = join(home(), "server.log");
    return {
      kind: "launchd",
      file: join(homedir(), "Library", "LaunchAgents", `${label()}.plist`),
      content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(label())}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(node)}</string><string>${xml(entry())}</string><string>start</string></array>
  <key>WorkingDirectory</key><string>${xml(app())}</string>
  <key>EnvironmentVariables</key>
  <dict>
${Object.entries(env)
  .map(([k, v]) => `    <key>${xml(k)}</key><string>${xml(v)}</string>`)
  .join("\n")}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`,
    };
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return {
      kind: "startup",
      file: join(
        appData,
        "Microsoft",
        "Windows",
        "Start Menu",
        "Programs",
        "Startup",
        `${name()}.vbs`,
      ),
      // Run with window style 0: no console window.
      content: `Set sh = CreateObject("WScript.Shell")
Set env = sh.Environment("Process")
${Object.entries(env)
  .map(([k, v]) => `env(${vbs(k)}) = ${vbs(v)}`)
  .join("\r\n")}
sh.CurrentDirectory = ${vbs(app())}
sh.Run ${vbs(`${vbs(node)} ${vbs(entry())} start`)}, 0, False
`.replace(/\r?\n/g, "\r\n"),
    };
  }
  return null;
}

const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { stdio: "ignore", timeout: 15_000 });
const uid = () => process.getuid?.() ?? 0;

async function answering(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port()}/api/sync`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function until(test: () => Promise<boolean>, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  for (;;) {
    if (await test()) return true;
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * Asks a running Quoli to exit (POST /api/shutdown, server/main.ts) and waits for the port to
 * free. False when one is still there: a version before 0.3.1, which has no such request.
 */
export async function stopRunning(): Promise<boolean> {
  if (!(await answering())) return true;
  const origin = `http://127.0.0.1:${port()}`;
  try {
    await fetch(`${origin}/api/shutdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: "{}",
      signal: AbortSignal.timeout(2000),
    });
  } catch {}
  return until(async () => !(await answering()), 5000);
}

/** Stops the service manager's copy too, so it is not restarted behind our back. */
function stopService(plan: AutostartPlan) {
  try {
    if (plan.kind === "systemd") run("systemctl", ["--user", "stop", `${name()}.service`]);
    if (plan.kind === "launchd") run("launchctl", ["bootout", `gui/${uid()}/${label()}`]);
  } catch {}
}

function startService(plan: AutostartPlan) {
  if (plan.kind === "systemd") {
    run("systemctl", ["--user", "daemon-reload"]);
    run("systemctl", ["--user", "enable", `${name()}.service`]);
    run("systemctl", ["--user", "restart", `${name()}.service`]);
  } else if (plan.kind === "launchd") {
    run("launchctl", ["bootstrap", `gui/${uid()}`, plan.file]);
  } else {
    spawn("wscript.exe", [plan.file], { detached: true, stdio: "ignore" }).unref();
  }
}

export type BackgroundResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "failed" | "busy"; detail?: string };

/**
 * Runs Quoli in the background from now on: stops whichever Quoli runs, refreshes the app copy,
 * (re)writes the login item and starts it, then waits until it answers.
 */
export async function startInBackground(): Promise<BackgroundResult> {
  const plan = autostartPlan();
  if (!plan) return { ok: false, reason: "unsupported" };
  stopService(plan);
  const free = await stopRunning();
  try {
    installSyncCommand();
    mkdirSync(dirname(plan.file), { recursive: true });
    writeFileSync(plan.file, plan.content);
    startService(plan);
  } catch (error) {
    removeAutostart();
    return { ok: false, reason: "failed", detail: String(error) };
  }
  // An old Quoli still holding the port: the service takes over once it is closed (it retries
  // on Linux and macOS; on Windows the next login starts it).
  if (!free) return { ok: false, reason: "busy" };
  if (await until(answering, 15_000)) return { ok: true };
  // Leave nothing half-installed: the caller runs Quoli in the terminal instead.
  removeAutostart();
  return { ok: false, reason: "failed", detail: "it did not answer within 15 seconds" };
}

/** `quoli stop`: until the next login. */
export async function stopBackground(): Promise<boolean> {
  const plan = autostartPlan();
  if (plan) stopService(plan);
  return stopRunning();
}

/** Takes the login item out (`setup --remove`, or when starting it failed). */
export function removeAutostart() {
  const plan = autostartPlan();
  if (!plan) return;
  stopService(plan);
  try {
    if (plan.kind === "systemd") run("systemctl", ["--user", "disable", `${name()}.service`]);
  } catch {}
  rmSync(plan.file, { force: true });
  try {
    if (plan.kind === "systemd") run("systemctl", ["--user", "daemon-reload"]);
  } catch {}
}
