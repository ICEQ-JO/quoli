#!/usr/bin/env node
/**
 * The `quoli` command of the published package (npm: quoli). Bundled by scripts/pack.mjs.
 *   quoli               first run: choose what to record, link an account; then (every time) run
 *                       Quoli in the background, started at login (server/autostart.ts)
 *   quoli stop          stop the background Quoli until the next login
 *   quoli demo          start with the synthetic demo project, in this terminal
 *   quoli connect       choose what to record + link this computer to a Quoli account + start
 *   quoli setup [...]   install the agents' hooks without an account (see setup.ts)
 *   quoli --version
 * Keep this file free of static imports: it must run on old Node to say that Node is too old.
 */
// node:sqlite is stable enough for Quoli; its "experimental" notice only confuses people.
const warn = process.emitWarning.bind(process);
process.emitWarning = ((w: string | Error, ...a: unknown[]) =>
  String(w).includes("SQLite")
    ? undefined
    : (warn as (...x: unknown[]) => void)(w, ...a)) as typeof process.emitWarning;

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.log(`Quoli needs Node.js 22.13 or newer, and this is Node.js ${process.versions.node}.
Install the current LTS from https://nodejs.org, then run the command again.`);
  process.exit(1);
}

const [cmd, ...rest] = process.argv.slice(2);
const portAt = process.argv.indexOf("--port");
if (portAt > 0) process.env.QUOLI_PORT = process.argv[portAt + 1];

const VERSION = process.env.QUOLI_VERSION ?? "dev";
const Q = "npx https://iceq.best/quoli.tgz";

// npx keeps the first copy it downloaded from a link and never looks again, so the permanent link
// (quoli.tgz) would stay on that version forever. Instead the package asks the site for the newest
// version (quoli.json, a public file with only a version number) and hands over to it.
if (
  process.env.QUOLI_BUNDLED === "1" &&
  !process.env.QUOLI_UPDATED &&
  !process.env.QUOLI_NO_UPDATE_CHECK &&
  cmd !== "sync" &&
  cmd !== "--version" &&
  cmd !== "-v"
) {
  const latest = await fetch("https://iceq.best/quoli.json", { signal: AbortSignal.timeout(2000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (typeof j?.version === "string" ? (j.version as string) : null))
    .catch(() => null);
  const newer = (a: string, b: string) => {
    const x = a.split(".").map(Number);
    const y = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
    return false;
  };
  if (latest && /^\d+\.\d+\.\d+$/.test(latest) && newer(latest, VERSION)) {
    console.log(`Starting the newest Quoli, ${latest} (npx had kept ${VERSION}).\n`);
    const { spawnSync } = await import("node:child_process");
    const run = spawnSync(
      "npx",
      ["-y", `https://iceq.best/quoli-${latest}.tgz`, ...process.argv.slice(2)],
      {
        stdio: "inherit",
        shell: process.platform === "win32",
        env: { ...process.env, QUOLI_UPDATED: "1" },
      },
    );
    if (run.status !== null || run.signal) process.exit(run.status ?? 1);
    console.log("Could not start the new version; continuing with this one.\n");
  }
}

/**
 * Starts Quoli: from the package, in the background and at every login, so the website always
 * finds it; from a clone, or with --foreground, in this terminal.
 */
async function open() {
  if (process.env.QUOLI_BUNDLED === "1" && !process.argv.includes("--foreground")) {
    const port = Number(process.env.QUOLI_PORT ?? 4400);
    const { localToken, pairLink } = await import("./token.ts");
    const site = pairLink(port, localToken());
    const { startInBackground } = await import("./autostart.ts");
    const result = await startInBackground();
    if (result.ok) {
      console.log(`
  Quoli is running in the background, and starts by itself when you log in.
  Open ${site}
  (the link connects this browser to Quoli once; keep it to yourself)

  You can close this terminal. To stop Quoli: ${Q} stop
  To open it again later: https://app.iceq.best, or ${Q} open
`);
      process.exit(0);
    }
    if (result.reason === "busy") {
      console.log(`
  Another Quoli is still running on port ${port}, most likely an older one in another terminal.
  Close it (Ctrl+C in that terminal)${
    process.platform === "win32"
      ? ", then run this again."
      : ": this one takes over by itself a few seconds later."
  }
  Then open ${site}
`);
      process.exit(0);
    }
    console.log(
      result.reason === "unsupported"
        ? "Quoli can't run in the background on this system; it runs here instead (keep this terminal open).\n"
        : /systemctl.*ETIMEDOUT/.test(result.detail ?? "")
          ? "Quoli could not start in the background: this computer's service manager (systemd) is not responding.\n" +
            "It runs here instead (keep this terminal open). To fix it, run `systemctl --user daemon-reexec`\n" +
            `(or log out and back in), then run ${Q} again.\n`
          : `Quoli could not start in the background (${result.detail}); it runs here instead (keep this terminal open).\n`,
    );
  }
  process.env.NODE_ENV = "production";
  await import("./main.ts");
}

if (cmd === "connect") {
  const { connectCli } = await import("./link.ts");
  const next = await connectCli(rest);
  if (next !== "start") process.exit(next);
  await open();
} else if (cmd === "stop") {
  const { stopBackground } = await import("./autostart.ts");
  console.log(
    (await stopBackground())
      ? `Quoli stopped. It starts again when you log in, or with ${Q}. Recording goes on either way.`
      : "Quoli is still running: it may be an older version in a terminal (Ctrl+C there).",
  );
} else if (cmd === "sync") {
  // Started by the hooks while Quoli is closed (server/background.ts); not for people.
  const { runSync } = await import("./background.ts");
  process.exit(await runSync());
} else if (cmd === "setup") {
  const { setupCli } = await import("./setup.ts");
  const code = setupCli(rest);
  if (rest.includes("--remove") && process.env.QUOLI_BUNDLED === "1") {
    const { removeAutostart, stopRunning } = await import("./autostart.ts");
    removeAutostart();
    await stopRunning();
  }
  process.exit(code);
} else if (cmd === "uninstall") {
  const { uninstallCli } = await import("./uninstall.ts");
  process.exit(await uninstallCli(rest));
} else if (cmd === "open") {
  // Opens the app already paired with this computer's Quoli (server/token.ts).
  const { localToken, pairLink } = await import("./token.ts");
  const { openBrowser } = await import("./link.ts");
  const link = pairLink(
    Number(process.env.QUOLI_PORT ?? 4400),
    localToken(),
    rest.includes("--local"),
  );
  openBrowser(link);
  console.log(`Opening Quoli in your browser. If nothing opens, open this link:\n  ${link}`);
} else if (cmd === "--version" || cmd === "-v") {
  console.log(VERSION);
} else if (cmd === "--help" || cmd === "-h" || cmd === "help") {
  console.log(`Quoli ${VERSION}: one map of what your coding agents did.

  ${Q}               the first time: choose what to record, link your account; every time:
                     run Quoli in the background (it starts at login), then open
                     https://app.iceq.best
  ${Q} open          open the app in your browser, connected to this computer's Quoli
  ${Q} stop          stop the background Quoli until the next login
  ${Q} connect       link this computer to your Quoli account (again, with --again)
  ${Q} setup         install the agents' hooks without an account
  ${Q} setup --remove   stop recording and take Quoli out of every agent
  ${Q} uninstall     remove Quoli completely, including everything it recorded
  ${Q} demo          start with a synthetic demo project, in this terminal
  --foreground       run Quoli in this terminal instead of in the background
  --all / --here     record every project / only the current one
  --port <n>         use another port (or set QUOLI_PORT)

\`stop\` stops the app; recording goes on until \`setup --remove\`. Data stays on this machine in ~/.quoli
(QUOLI_HOME to change); a linked account receives summaries, never prompts or code.`);
} else if (cmd === undefined || cmd.startsWith("--")) {
  // The one command people need: the first time it sets Quoli up, afterwards it opens it.
  const args = process.argv.slice(2);
  const { firstRun, chooseScope } = await import("./onboard.ts");
  if (firstRun()) {
    console.log("Setting up Quoli on this computer.\n");
    const { connectCli } = await import("./link.ts");
    const next = await connectCli(args, { askToLink: true });
    if (next !== "start") process.exit(next);
  } else {
    // --all / --here change the choice; inside a project that is not recorded, offer to add it.
    const line = await chooseScope(args);
    if (args.includes("--all") || args.includes("--here")) console.log(`${line}\n`);
  }
  await open();
} else if (cmd === "start" || cmd === "demo") {
  process.env.NODE_ENV = "production";
  if (cmd === "demo") process.argv.push("--demo");
  await import("./main.ts");
} else {
  console.log(`Unknown command: ${cmd}. Run \`${Q} --help\`.`);
  process.exit(1);
}

export {};
