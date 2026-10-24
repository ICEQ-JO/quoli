import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium, expect } from "@playwright/test";

import { artifactDigest, signManifest } from "../apps/cli/src/release";
import { releaseManifestSchema } from "../packages/schema/src/release";

const exec = promisify(execFile);
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

test("relocated local release installs, captures, restarts and uninstalls without the source checkout", {
  skip: process.env.QUOLI_RELEASE_TEST !== "1",
  timeout: 120000,
}, async () => {
  const base = mkdtempSync(join(tmpdir(), "quoli-release-"));
  const releaseCli = resolve("dist/quoli/cli.mjs");
  const app = join(base, "installed app"),
    bin = join(base, "bin"),
    data = join(base, "private"),
    repo = join(base, "repo");
  const webPort = await freePort(),
    collectorPort = await freePort();
  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    QUOLI_INSTALL_DIR: app,
    QUOLI_BIN_DIR: bin,
    XDG_CONFIG_HOME: join(base, "config"),
    TRACEFRAME_DATA_DIR: data,
    TRACEFRAME_WEB_PORT: String(webPort),
    TRACEFRAME_COLLECTOR_PORT: String(collectorPort),
  };
  let installed = false;
  const cli = async (...args: string[]) =>
    (
      await exec(process.execPath, [installed ? join(bin, "quoli") : releaseCli, ...args], {
        cwd: repo,
        env,
        timeout: 45000,
        maxBuffer: 1024 * 1024,
      })
    ).stdout;
  const git = async (...args: string[]) =>
    (await exec("/usr/bin/git", args, { cwd: repo, env })).stdout.trim();
  const api = async (path: string) => {
    const response = await fetch(`http://127.0.0.1:${collectorPort}${path}`, {
      headers: { Authorization: `Bearer ${readFileSync(join(data, "credential"), "utf8").trim()}` },
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    mkdirSync(repo);
    await git("init", "--quiet", "--initial-branch=main");
    await git("config", "user.name", "ICEQ-JO");
    await git("config", "user.email", "151853839+ICEQ-JO@users.noreply.github.com");
    writeFileSync(join(repo, "example.ts"), "export const value = 1;\n");
    await git("add", ".");
    await git("commit", "--quiet", "-m", "Synthetic release baseline");
    assert.match(await cli("install"), /Installed/);
    installed = true;
    assert.ok(existsSync(join(app, "web/apps/web/server.js")));
    assert.equal(
      (await cli("--version")).trim(),
      JSON.parse(readFileSync(resolve("dist/quoli/release.json"), "utf8")).version,
    );
    // This command runs from the target repository; the user needs no source cwd or pnpm.
    assert.match(
      await cli("connect", "--capture-code", "--name", "Release fixture"),
      /Quoli is running/,
    );
    assert.equal(existsSync(join(repo, ".claude")), false);
    assert.match(await cli("status"), /ready.*authenticated managed instance/);
    const state = JSON.parse(readFileSync(join(data, "quoli-service.json"), "utf8"));
    assert.equal(statSync(join(data, "quoli-service.json")).mode & 0o777, 0o600);
    assert.equal(statSync(data).mode & 0o777, 0o700);
    assert.equal((await fetch(`http://127.0.0.1:${webPort}/api/health`)).status, 200);
    const connection = await fetch(`http://127.0.0.1:${webPort}/connect`, { redirect: "manual" });
    const dashboard = await fetch(`http://127.0.0.1:${webPort}`, {
      headers: { Cookie: connection.headers.get("set-cookie")?.split(";")[0] ?? "" },
    });
    const html = await dashboard.text();
    assert.match(html, /Quoli/);
    const asset = html.match(/src="([^" ]+\.js[^" ]*)"/)?.[1];
    assert.ok(asset);
    assert.equal((await fetch(`http://127.0.0.1:${webPort}${asset}`)).status, 200);
    const projects = await api("/v1/projects");
    const project = projects.find((item: { name: string }) => item.name === "Release fixture")?.id;
    assert.ok(project);
    for (let n = 0; n < 80 && !(await api(`/v1/projects/${project}/sessions`)).length; n++)
      await delay(100);
    const sessions = await api(`/v1/projects/${project}/sessions`);
    assert.equal(sessions[0].kind, "repository");
    writeFileSync(join(repo, "example.ts"), "export const value = 2;\n");
    for (
      let n = 0;
      n < 80 &&
      (await api(`/v1/projects/${project}/sessions/${sessions[0].id}/snapshots`)).total < 2;
      n++
    )
      await delay(100);
    assert.equal(
      (await api(`/v1/projects/${project}/sessions/${sessions[0].id}/snapshots`)).total,
      2,
    );
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${webPort}`);
      await expect(page.getByRole("button", { name: /^Repository history/ })).toBeVisible({
        timeout: 15000,
      });
      await page.getByRole("button", { name: /^Repository history/ }).click();
      await expect(
        page.getByRole("heading", { name: "Automatic repository history" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Open captured diffs", exact: true }).click();
      await expect(page.getByRole("region", { name: "Unified code diff" })).toContainText(
        "value = 2",
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
    await cli("start");
    assert.equal(
      JSON.parse(readFileSync(join(data, "quoli-service.json"), "utf8")).instance,
      state.instance,
    );
    await cli("restart");
    assert.notEqual(
      JSON.parse(readFileSync(join(data, "quoli-service.json"), "utf8")).instance,
      state.instance,
    );
    assert.equal(
      (await api(`/v1/projects/${project}/sessions/${sessions[0].id}/snapshots`)).total,
      2,
    );
    await assert.rejects(cli("uninstall"), /quoli stop/);
    await cli("connect", "--agent", "claude");
    const hookSettings = JSON.parse(readFileSync(join(repo, ".claude/settings.json"), "utf8"));
    const hook = hookSettings.hooks.SessionStart[0].hooks[0].command;
    assert.ok(hook.includes("quoli-hook-v1.mjs"));
    assert.ok(!hook.includes("tsx"));
    await new Promise<void>((resolve, reject) => {
      const child = spawn("/bin/sh", ["-c", hook], {
        cwd: repo,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("Packaged hook failed")),
      );
      child.stdin.end(
        JSON.stringify({
          hook_event_name: "SessionStart",
          session_id: "fixture-hook",
          cwd: repo,
          source: "startup",
        }),
      );
    });
    assert.ok(
      (await api(`/v1/projects/${project}/sessions`)).some(
        (item: { id: string }) => item.id === "fixture-hook",
      ),
    );
    writeFileSync(join(bin, "opencode"), "#!/bin/sh\nprintf 'opencode v2.0.32\\n'\n");
    chmodSync(join(bin, "opencode"), 0o755);
    assert.match(await cli("connect", "--agent", "opencode"), /OpenCode plugin written/);
    const pluginPath = join(repo, ".opencode/plugins/quoli.js");
    const pluginSource = readFileSync(pluginPath, "utf8");
    assert.ok(pluginSource.includes("quoli-opencode-v1.mjs"));
    assert.equal(pluginSource.includes("tsx"), false);
    const { default: plugin } = await import(pathToFileURL(pluginPath).href);
    const cleanup = plugin.setup({
      app: { version: "2.0.32" },
      location: { directory: repo },
      event: {
        async *subscribe() {
          yield {
            id: "evt_release_opencode",
            type: "session.created",
            created: Date.now(),
            location: { directory: repo },
            durable: { aggregateID: "ses_release_opencode", seq: 1, version: 1 },
            data: { sessionID: "ses_release_opencode" },
          };
        },
      },
    });
    try {
      let captured = false;
      for (let n = 0; n < 100; n++) {
        captured = (await api(`/v1/projects/${project}/sessions`)).some(
          (item: { id: string }) => item.id === "ses_release_opencode",
        );
        if (captured) break;
        await delay(100);
      }
      assert.ok(captured, "Relocated OpenCode worker did not deliver its synthetic session");
    } finally {
      await cleanup();
    }
    await cli("stop");
    await cli("stop");
    assert.match(await cli("status"), /stopped/);
    for (const port of [webPort, collectorPort])
      await assert.rejects(
        fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) }),
      );
    const evidenceBytes = statSync(join(data, "traceframe.sqlite")).size;
    assert.ok(evidenceBytes > 0);
    await assert.rejects(cli("uninstall"), /referenced by installed Quoli hooks/);
    await cli("hooks", "uninstall", repo);
    await assert.rejects(cli("uninstall"), /OpenCode plugin/);
    await cli("hooks", "opencode", "uninstall", repo);
    await cli("uninstall");
    installed = false;
    assert.equal(existsSync(join(bin, "quoli")), false);
    assert.equal(existsSync(app), false);
    assert.equal(statSync(join(data, "traceframe.sqlite")).size, evidenceBytes);
  } finally {
    try {
      if (installed) await cli("stop");
    } catch {}
    rmSync(base, { recursive: true, force: true });
  }
});

async function runtimeFixture() {
  const base = mkdtempSync(join(tmpdir(), "quoli-runtime-"));
  const data = join(base, "private");
  mkdirSync(data, { mode: 0o700 });
  const webPort = await freePort(),
    collectorPort = await freePort();
  const env = {
    ...process.env,
    TRACEFRAME_DATA_DIR: data,
    TRACEFRAME_WEB_PORT: String(webPort),
    TRACEFRAME_COLLECTOR_PORT: String(collectorPort),
    QUOLI_INSTALL_DIR: join(base, "app"),
    QUOLI_BIN_DIR: join(base, "bin"),
    XDG_CONFIG_HOME: join(base, "config"),
  };
  const cli = async (...args: string[]) =>
    (
      await exec(process.execPath, [resolve("dist/quoli/cli.mjs"), ...args], {
        cwd: base,
        env,
        timeout: 45000,
      })
    ).stdout;
  return {
    base,
    data,
    webPort,
    collectorPort,
    env,
    cli,
    async close() {
      try {
        await cli("stop");
      } catch {}
      rmSync(base, { recursive: true, force: true });
    },
  };
}

test("managed startup refuses unrelated listeners and never stops an unauthenticated saved PID", {
  skip: process.env.QUOLI_RELEASE_TEST !== "1",
  timeout: 60000,
}, async () => {
  const f = await runtimeFixture();
  const listener = createHttpServer((_req, res) => res.end("{}"));
  listener.listen(f.webPort, "127.0.0.1");
  await once(listener, "listening");
  try {
    await assert.rejects(f.cli("start"), /could not start/);
    assert.equal((await fetch(`http://127.0.0.1:${f.webPort}`)).status, 200);
    assert.equal(existsSync(join(f.data, "quoli-service.json")), false);
    const state = {
      format: 1,
      instance: "3".repeat(32),
      token: "4".repeat(64),
      pid: process.pid,
      controlPort: f.webPort,
      startedAt: new Date().toISOString(),
      releaseRoot: "unrelated",
      webPort: f.webPort,
      collectorPort: f.collectorPort,
    };
    writeFileSync(join(f.data, "quoli-service.json"), JSON.stringify(state), { mode: 0o600 });
    await assert.rejects(f.cli("stop"), /No process was signalled/);
    assert.equal((await fetch(`http://127.0.0.1:${f.webPort}`)).status, 200);
    assert.equal(
      JSON.parse(readFileSync(join(f.data, "quoli-service.json"), "utf8")).pid,
      process.pid,
    );
  } finally {
    listener.closeAllConnections();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    await f.close();
  }
});

test("supervisor crash releases child listeners and the next start recovers stale state", {
  skip: process.env.QUOLI_RELEASE_TEST !== "1",
  timeout: 60000,
}, async () => {
  const f = await runtimeFixture();
  try {
    await Promise.all([f.cli("start"), f.cli("start")]);
    const state = JSON.parse(readFileSync(join(f.data, "quoli-service.json"), "utf8"));
    process.kill(state.pid, "SIGKILL"); // This is the disposable supervisor just started by this test.
    for (let n = 0; n < 60; n++) {
      try {
        await fetch(`http://127.0.0.1:${f.webPort}/api/health`, {
          signal: AbortSignal.timeout(200),
        });
        await delay(100);
      } catch {
        break;
      }
    }
    for (const port of [f.webPort, f.collectorPort])
      await assert.rejects(
        fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(300) }),
      );
    await f.cli("start");
    const restored = JSON.parse(readFileSync(join(f.data, "quoli-service.json"), "utf8"));
    assert.notEqual(restored.instance, state.instance);
    assert.match(await f.cli("status"), /ready/);
    await f.cli("stop");
  } finally {
    await f.close();
  }
});

test("local install refuses unrelated destination files", {
  skip: process.env.QUOLI_RELEASE_TEST !== "1",
  timeout: 30000,
}, async () => {
  const f = await runtimeFixture();
  try {
    mkdirSync(f.env.QUOLI_BIN_DIR);
    const command = join(f.env.QUOLI_BIN_DIR, "quoli");
    writeFileSync(command, "unrelated command");
    await assert.rejects(f.cli("install"), /different quoli command/);
    assert.equal(readFileSync(command, "utf8"), "unrelated command");
    assert.equal(existsSync(f.env.QUOLI_INSTALL_DIR), false);
  } finally {
    await f.close();
  }
});

test("standalone release verifier works before extraction without pnpm or source imports", {
  skip: process.env.QUOLI_RELEASE_TEST !== "1",
  timeout: 30000,
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), "quoli-verify-package-"));
  try {
    const archive = join(dir, "quoli-0.1.0-linux-x64.tar.gz"),
      keyFile = join(dir, "trusted.pem");
    const pair = generateKeyPairSync("ed25519");
    writeFileSync(archive, "Inert synthetic archive, never extracted or executed");
    writeFileSync(keyFile, pair.publicKey.export({ type: "spki", format: "pem" }));
    signManifest(
      archive,
      releaseManifestSchema.parse({
        format: 1,
        product: "quoli",
        version: "0.1.0",
        platform: "linux",
        arch: "x64",
        node: ">=24.16.0 <25",
        source: { commit: "a".repeat(40), tag: "v0.1.0", epoch: 1792800000, clean: true },
        toolchain: { node: "24.16.0", pnpm: "11.12.0", lockSha256: "b".repeat(64) },
        archive: { name: "quoli-0.1.0-linux-x64.tar.gz", ...(await artifactDigest(archive)) },
      }),
      pair.privateKey,
    );
    const args = [resolve("dist/verify-release.mjs"), archive, keyFile, "0.1.0"];
    const env = { PATH: "/usr/bin:/bin" };
    assert.match(
      (await exec(process.execPath, args, { cwd: dir, env })).stdout,
      /Verified Quoli 0.1.0/,
    );
    writeFileSync(archive, "Tampered inert synthetic bytes");
    await assert.rejects(
      exec(process.execPath, args, { cwd: dir, env }),
      /Release verification failed/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
