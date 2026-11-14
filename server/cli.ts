#!/usr/bin/env node
/**
 * The `quoli` command of the published package (npm: quoli). Bundled by scripts/pack.mjs.
 *   quoli               first run: choose what to record, link an account, start; later: start
 *   quoli demo          start with the synthetic demo project
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
    console.log(`Quoli ${latest} is out (this is ${VERSION}); starting it.\n`);
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

if (cmd === "connect") {
  const { connectCli } = await import("./link.ts");
  const next = await connectCli(rest);
  if (next !== "start") process.exit(next);
  process.env.NODE_ENV = "production";
  await import("./main.ts");
} else if (cmd === "sync") {
  // Started by the hooks while Quoli is closed (server/background.ts); not for people.
  const { runSync } = await import("./background.ts");
  process.exit(await runSync());
} else if (cmd === "setup") {
  const { setupCli } = await import("./setup.ts");
  process.exit(setupCli(rest));
} else if (cmd === "--version" || cmd === "-v") {
  console.log(VERSION);
} else if (cmd === "--help" || cmd === "-h" || cmd === "help") {
  console.log(`Quoli ${VERSION}: one map of what your coding agents did.

  ${Q}               the first time: choose what to record, link your account, start;
                     after that: start Quoli; open it at https://iceq.best/studio/
  ${Q} connect       link this computer to your Quoli account (again, with --again)
  ${Q} setup         install the agents' hooks without an account
  ${Q} setup --remove   stop recording and take Quoli out of every agent
  ${Q} demo          start with a synthetic demo project
  --all / --here     record every project / only the current one
  --port <n>         use another port (or set QUOLI_PORT)

Recording keeps working with Quoli closed. Data stays on this machine in ~/.quoli
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
  process.env.NODE_ENV = "production";
  await import("./main.ts");
} else if (cmd === "start" || cmd === "demo") {
  process.env.NODE_ENV = "production";
  if (cmd === "demo") process.argv.push("--demo");
  await import("./main.ts");
} else {
  console.log(`Unknown command: ${cmd}. Run \`${Q} --help\`.`);
  process.exit(1);
}

export {};
