import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { createApp, json } from "../server/app.ts";
import { hook } from "../server/connect.ts";
import { Store } from "../server/db.ts";
import { localToken, pairLink, sameToken, unseal } from "../server/token.ts";

const run = promisify(execFile);

async function start(token: string) {
  const store = new Store(":memory:");
  let port = 0;
  const app = createApp(store, () => port, token);
  const server = createServer(async (req, res) => {
    if (!(await app.api(req, res, new URL(req.url ?? "/", "http://127.0.0.1")))) json(res, 404, {});
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
  return { store, port, close: () => server.close() };
}

test("the token is created once, owner-only, and the pairing link carries it in the fragment", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "quoli-token-")));
  const before = process.env.QUOLI_HOME;
  process.env.QUOLI_HOME = dir;
  try {
    const t = localToken();
    assert.match(t, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(localToken(), t, "stable across starts");
    if (process.platform !== "win32")
      assert.equal(statSync(join(dir, "token")).mode & 0o777, 0o600);
    assert.equal(pairLink(4400, t), `https://app.iceq.best/#pair=${t}`);
    assert.equal(pairLink(4401, t), `https://app.iceq.best/#pair=${t}&port=4401`);
    assert.equal(pairLink(4400, t, true), `http://127.0.0.1:4400/#pair=${t}`);
    assert.ok(sameToken(t, t) && !sameToken(`${t}x`, t) && !sameToken(undefined, t));
  } finally {
    process.env.QUOLI_HOME = before;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("without the token the API answers 401, for the app's own origin too", async () => {
  const { port, close } = await start("t".repeat(43));
  try {
    const url = `http://127.0.0.1:${port}/api/projects`;
    const refused = await fetch(url);
    assert.equal(refused.status, 401);
    assert.equal(((await refused.json()) as { pair: boolean }).pair, true);
    const wrong = await fetch(url, { headers: { "X-Quoli-Token": "nope" } });
    assert.equal(wrong.status, 401);
    const own = `http://127.0.0.1:${port}`;
    const change = await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: "PUT",
      headers: { Origin: own, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(change.status, 401, "a page or program on this computer cannot change settings");
    const ok = await fetch(url, { headers: { "X-Quoli-Token": "t".repeat(43) } });
    assert.equal(ok.status, 200);
    // The website's preflight allows the header.
    const pre = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.iceq.best",
        "Access-Control-Request-Headers": "x-quoli-token",
      },
    });
    assert.match(pre.headers.get("access-control-allow-headers") ?? "", /X-Quoli-Token/);
  } finally {
    close();
  }
});

test("hook events are accepted only sealed with this computer's token", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "quoli-seal-")));
  const before = process.env.QUOLI_HOME;
  process.env.QUOLI_HOME = home;
  const token = localToken();
  process.env.QUOLI_HOME = before;
  const { store, port, close } = await start(token);
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "quoli-seal-repo-")));
  try {
    const plain = await fetch(`http://127.0.0.1:${port}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "x", cwd: repo, hook_event_name: "SessionStart" }),
    });
    assert.equal(plain.status, 401, "an unsealed event is refused");

    await run("git", ["init", "-q", repo]);
    const event = JSON.stringify({ session_id: "s1", cwd: repo, hook_event_name: "SessionStart" });
    const child = execFile(process.execPath, [hook, String(port)], {
      env: { ...process.env, QUOLI_HOME: home },
    });
    child.stdin?.end(event);
    await new Promise((ok) => child.on("exit", ok));
    assert.equal(store.roots().length, 1, "the real hook seals with the token and is recorded");
  } finally {
    close();
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a sealed event cannot be opened with another token", () => {
  assert.equal(
    unseal({ iv: "AAAAAAAAAAAAAAAA", data: "AAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==" }, "x"),
    null,
  );
  assert.equal(unseal(undefined, "x"), null);
});

test("the OpenCode plugin and Pi extension are installed with the token's location", async () => {
  const { pluginSource } = await import("../server/connect.ts");
  for (const agent of ["opencode", "pi"] as const) {
    const text = pluginSource(agent, "/tmp/spool.jsonl");
    assert.ok(!text.includes("__QUOLI_"), `${agent}: every placeholder is filled`);
    assert.match(text, /const TOKEN_FILE = ".+\/token";/);
  }
});
