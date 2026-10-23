#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { autostart, loginLifecycle } from "./autostart";
import { childEnvironment, cliConfig, connectArguments, requireNode } from "./config";
import { installRelease, uninstallRelease } from "./install";
import { serviceStatus, startService, stopService } from "./lifecycle";

const help = `Quoli — local evidence for coding-agent work

quoli install                      Install this unpacked release for your user
quoli connect [repository]          Connect once and start background capture
  --capture-code                   Opt into redacted file versions and diffs
  --include-untracked              Separately opt into untracked files
  --agent claude|opencode          Optionally install supported agent capture
quoli start | stop | restart        Manage the local background runtime
quoli status                       Show managed identity and listener health
quoli open                         Print the local dashboard address
quoli hooks uninstall [repository]  Remove Quoli hooks without deleting evidence
quoli hooks opencode status|uninstall [repository]  Inspect/remove the OpenCode plugin
quoli settings ...                 Capture policy, pause, retention and deletion
quoli autostart enable|disable|status  Optional Linux user-login startup
quoli uninstall                    Remove the installed app; preserve evidence

All listeners bind to loopback. Node 24.16+ within Node 24 and Git are required.
No agent is configured unless you explicitly request its integration.`;
const root = dirname(fileURLToPath(import.meta.url));
const config = cliConfig(root);
async function run(script: string, args: string[]) {
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "runtime", script), ...args], {
      cwd: process.cwd(),
      env: childEnvironment(config),
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (code) throw new Error("Quoli command did not complete; see the diagnostic above.");
}
async function main() {
  requireNode();
  const [command, ...args] = process.argv.slice(2);
  if (!command || ["help", "--help", "-h"].includes(command)) {
    console.log(help);
    return;
  }
  if (command === "--version") {
    console.log(JSON.parse(readFileSync(join(root, "release.json"), "utf8")).version);
    return;
  }
  if (!["connect", "settings", "hooks", "autostart"].includes(command) && args.length)
    throw new Error("Unexpected command arguments. Run quoli help.");
  if (command === "install") {
    console.log(
      `Installed ${await installRelease(config)}. Add its bin directory to PATH if needed; no shell profile was edited.`,
    );
    return;
  }
  if (command === "uninstall") {
    await uninstallRelease(config);
    console.log("Quoli removed. Evidence and agent configuration were preserved.");
    return;
  }
  if (command === "autostart") {
    if (args.length !== 1) throw new Error("Use quoli autostart enable|disable|status.");
    await autostart(config, args[0]);
    return;
  }
  if (command === "hooks") {
    if (!["uninstall", "status", "drain", "opencode"].includes(args[0]))
      throw new Error("Use quoli hooks uninstall|status [repository], or quoli hooks drain.");
    await run("quoli-hook-v1.mjs", args);
    return;
  }
  if (command === "settings") {
    await run("settings.mjs", args);
    return;
  }
  if (command === "connect") {
    // Options can precede or follow the path; add cwd only when no path argument
    // exists, leaving option values to the setup parser when a path is supplied.
    const controls = ["--check", "--disable", "--undo", "--help", "-h"];
    const forwarded = connectArguments(args, process.cwd());
    await run("connect.mjs", forwarded);
    if (!args.some((arg) => controls.includes(arg))) {
      if (!(await loginLifecycle(config, "start"))) await startService(config);
      console.log(`Quoli is running at ${config.url}`);
    }
    return;
  }
  if (command === "stop") {
    if (!(await loginLifecycle(config, "stop"))) await stopService(config);
    console.log("Quoli stopped. Evidence is preserved.");
    return;
  }
  if (command === "restart") {
    if (!(await loginLifecycle(config, "restart"))) {
      await stopService(config);
      await startService(config);
    }
    console.log(`Quoli ready at ${config.url}`);
    return;
  }
  if (command === "start" || command === "serve") {
    if (command === "start" && (await loginLifecycle(config, "start"))) {
      console.log(`Quoli ready at ${config.url}`);
      return;
    }
    const child = await startService(config, command === "serve");
    console.log(`Quoli ready at ${config.url}`);
    if (command === "serve" && child) {
      process.once("SIGTERM", () => child.kill("SIGTERM"));
      process.once("SIGINT", () => child.kill("SIGTERM"));
      if (child.exitCode !== null || child.signalCode !== null)
        process.exitCode = child.exitCode ?? 1;
      else
        await new Promise<void>((resolve) =>
          child.once("exit", (code) => {
            process.exitCode = code ?? 1;
            resolve();
          }),
        );
    }
    return;
  }
  if (command === "status") {
    const status = await serviceStatus(config);
    if (status.status === "stopped") {
      console.log("Quoli is stopped.");
      return;
    }
    if (status.status === "unverified") {
      console.log(
        "Saved service state is unverified or stale. No PID is trusted or signalled. Retry quoli start after a minute to reclaim a stale reservation.",
      );
      process.exitCode = 1;
      return;
    }
    let ready = false;
    try {
      ready = (
        await fetch(`http://127.0.0.1:${status.state.webPort}/api/health`, {
          signal: AbortSignal.timeout(1500),
          redirect: "error",
        })
      ).ok;
    } catch {}
    console.log(
      `Quoli ${ready ? status.health.phase : "degraded"} at http://127.0.0.1:${status.state.webPort} (authenticated managed instance).`,
    );
    console.log(`Started ${status.state.startedAt}. Log: ${config.logFile}`);
    if (!ready) process.exitCode = 1;
    return;
  }
  if (command === "open") {
    const status = await serviceStatus(config);
    if (status.status !== "managed") throw new Error("Start Quoli before opening the dashboard.");
    console.log(`http://127.0.0.1:${status.state.webPort}`);
    return;
  }
  throw new Error("Unknown command. Run quoli help.");
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Quoli operation failed.");
  process.exitCode = 1;
});
