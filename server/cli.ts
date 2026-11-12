#!/usr/bin/env node
/**
 * The `quoli` command of the published package (npm: quoli). Bundled by scripts/pack.mjs.
 *   quoli               start Quoli on http://127.0.0.1:4400 (QUOLI_PORT or --port to change)
 *   quoli demo          start with the synthetic demo project
 *   quoli connect       setup + link this computer to a Quoli account (see link.ts) + start
 *   quoli setup [...]   record every repository for the agents on this machine (see setup.ts)
 *   quoli --version
 */
const [cmd, ...rest] = process.argv.slice(2);
const portAt = process.argv.indexOf("--port");
if (portAt > 0) process.env.QUOLI_PORT = process.argv[portAt + 1];

const VERSION = process.env.QUOLI_VERSION ?? "dev";
const Q = `npx https://iceq.best/quoli-${VERSION}.tgz`;

if (cmd === "connect") {
  const { connectCli } = await import("./link.ts");
  const next = await connectCli(rest);
  if (next !== "start") process.exit(next);
  process.env.NODE_ENV = "production";
  await import("./main.ts");
} else if (cmd === "setup") {
  const { setupCli } = await import("./setup.ts");
  process.exit(setupCli(rest));
} else if (cmd === "--version" || cmd === "-v") {
  console.log(VERSION);
} else if (cmd === "--help" || cmd === "-h" || cmd === "help") {
  console.log(`Quoli ${VERSION}: one map of what your coding agents did.

  ${Q} connect       set up, link this computer to your Quoli account, and start
  ${Q}               start Quoli on http://127.0.0.1:4400
  ${Q} setup         record every repository for Claude Code, Codex, OpenCode and Pi
  ${Q} setup --remove
  ${Q} demo          start with a synthetic demo project
  --port <n>   use another port (or set QUOLI_PORT)

Data stays on this machine in ~/.quoli (QUOLI_HOME to change).`);
} else if (cmd === undefined || cmd === "start" || cmd === "demo" || cmd === "--port") {
  process.env.NODE_ENV = "production";
  if (cmd === "demo") process.argv.push("--demo");
  await import("./main.ts");
} else {
  console.log(`Unknown command: ${cmd}. Run \`${Q} --help\`.`);
  process.exit(1);
}

export {};
