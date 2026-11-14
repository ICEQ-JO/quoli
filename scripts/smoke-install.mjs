#!/usr/bin/env node
/**
 * The install a user does, end to end, on this operating system (CI runs it on macOS and Windows):
 * the packaged `quoli` (release/, from scripts/pack.mjs) in a throwaway home with a fake Claude Code
 * folder. It checks: first run sets up hooks and returns with Quoli running in the background; the
 * login item exists; app.iceq.best may read it; a hook event becomes a session; running `quoli`
 * again restarts it; `stop` stops it; `setup --remove` takes the login item out.
 *
 *   node scripts/smoke-install.mjs
 *
 * Uses port 4455 and the service name quoli-ci, so it never touches a real Quoli.
 */
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("release/server/cli.mjs");
if (!existsSync(cli)) throw new Error("Run node scripts/pack.mjs first");

const PORT = 4455;
const root = mkdtempSync(join(tmpdir(), "quoli-smoke-"));
const home = join(root, "home");
const repo = join(root, "repo");
mkdirSync(join(home, ".claude"), { recursive: true });
mkdirSync(join(home, "AppData", "Roaming"), { recursive: true });
mkdirSync(repo, { recursive: true });
execFileSync("git", ["init", "-q", repo]);

const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  APPDATA: join(home, "AppData", "Roaming"),
  QUOLI_PORT: String(PORT),
  QUOLI_SERVICE_NAME: "quoli-ci",
  QUOLI_NO_UPDATE_CHECK: "1",
};
delete env.QUOLI_HOME;
delete env.XDG_CONFIG_HOME;

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) failed++;
};

function quoli(...args) {
  const run = spawnSync(process.execPath, [cli, ...args], {
    cwd: repo,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  console.log(`\n$ quoli ${args.join(" ")}  (exit ${run.status})\n${out.trim()}\n`);
  return { status: run.status, out };
}

const url = (path) => `http://127.0.0.1:${PORT}${path}`;
async function get(path, headers = {}) {
  try {
    const res = await fetch(url(path), { headers, signal: AbortSignal.timeout(3000) });
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
  } catch {
    return null;
  }
}
async function until(test, ms = 20_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const loginItem = {
  darwin: join(home, "Library", "LaunchAgents", "best.iceq.quoli-ci.plist"),
  win32: join(
    home,
    "AppData",
    "Roaming",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
    "quoli-ci.vbs",
  ),
}[process.platform];

try {
  // 1. The first run, as `npx https://iceq.best/quoli.tgz` inside a project.
  const first = quoli("--here");
  ok("first run returns", first.status === 0);
  ok("says it runs in the background", /running in the background/.test(first.out));
  ok("Quoli answers", await until(async () => (await get("/api/settings"))?.status === 200));
  const info = (await get("/api/settings"))?.body?.info;
  ok("data lives in the new home", info?.dataDir?.startsWith(home), info?.dataDir);
  if (loginItem) ok("login item written", existsSync(loginItem), loginItem);
  if (process.platform === "darwin") {
    const uid = process.getuid();
    const loaded = spawnSync("launchctl", ["print", `gui/${uid}/best.iceq.quoli-ci`]);
    ok("LaunchAgent loaded", loaded.status === 0);
  }

  // 2. The website may read it; other sites may not.
  const site = await get("/api/projects", { Origin: "https://app.iceq.best" });
  ok(
    "app.iceq.best allowed",
    site?.headers.get("access-control-allow-origin") === "https://app.iceq.best",
  );
  const other = await get("/api/projects", { Origin: "https://example.com" });
  ok("other sites refused", other?.headers.get("access-control-allow-origin") === null);

  // 3. A Claude Code hook event, run the way Claude Code runs it, becomes a session.
  const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
  const command = settings.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.command;
  ok("Claude Code hook installed", typeof command === "string", command);
  if (command) {
    const payload = JSON.stringify({
      session_id: "smoke-1",
      cwd: repo,
      hook_event_name: "UserPromptSubmit",
      prompt: "Add a health check route",
    });
    try {
      execSync(command, {
        input: payload,
        env,
        timeout: 20_000,
        stdio: ["pipe", "inherit", "inherit"],
      });
    } catch (error) {
      ok("hook command runs", false, String(error));
    }
    ok(
      "the event became a session",
      await until(async () =>
        ((await get("/api/sessions"))?.body ?? []).some?.((s) => s.id === "smoke-1"),
      ),
    );
  }

  // 4. Running it again (an update) stops the running copy and starts the new one.
  const again = quoli();
  ok("second run returns", again.status === 0);
  ok(
    "Quoli answers after the restart",
    await until(async () => (await get("/api/settings"))?.status === 200),
  );

  // 5. stop, then remove.
  const stop = quoli("stop");
  ok("stop returns", stop.status === 0);
  ok("Quoli stopped", await until(async () => (await get("/api/settings")) === null, 10_000));
  const remove = quoli("setup", "--remove");
  ok("setup --remove returns", remove.status === 0);
  if (loginItem) ok("login item removed", !existsSync(loginItem));
} finally {
  // Leave nothing running on the runner, whatever failed.
  quoli("stop");
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll install checks passed");
process.exit(failed ? 1 : 0);
