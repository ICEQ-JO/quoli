import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp, json } from "../server/app.ts";
import { hook } from "../server/connect.ts";
import { Store } from "../server/db.ts";

const unix = process.platform !== "win32";
const tmp = (name: string) => realpathSync.native(mkdtempSync(join(tmpdir(), name)));
const secretsOf = (file: string) =>
  /const SECRETS = \[[\s\S]*?\];/.exec(readFileSync(file, "utf8"))?.[0] ?? "";

test("the hook and both plugins redact with the same rules as the server", () => {
  const server = secretsOf("server/ingest.ts");
  assert.ok(server.includes("sk-"));
  for (const f of ["server/hook.mjs", "server/opencode-plugin.js", "server/pi-extension.ts"])
    assert.equal(secretsOf(f), server, f);
});

test("with Quoli closed, the hook redacts secrets before queueing the event", () => {
  const dir = tmp("quoli-spool-");
  try {
    const copy = join(dir, "quoli-hook.mjs");
    copyFileSync(hook, copy);
    const key = `sk-${"a".repeat(32)}`;
    execFileSync(process.execPath, [copy, "1"], {
      input: JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s", prompt: key }),
    });
    const queued = readFileSync(join(dir, "spool.jsonl"), "utf8");
    assert.ok(!queued.includes(key), "the key never reaches the disk");
    assert.ok(queued.includes("[redacted]"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("only this account can read Quoli's data folder and database", { skip: !unix }, () => {
  const dir = tmp("quoli-private-");
  try {
    const db = join(dir, "data", "quoli.db");
    new Store(db).db.close();
    assert.equal(statSync(join(dir, "data")).mode & 0o777, 0o700);
    assert.equal(statSync(db).mode & 0o777, 0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("/api/file does not follow a symlink out of the project", async () => {
  const root = tmp("quoli-link-");
  const outside = tmp("quoli-outside-");
  const store = new Store(":memory:");
  const app = createApp(store, () => 0);
  const server = createServer(async (req, res) => {
    if (!(await app.api(req, res, new URL(req.url ?? "/", "http://127.0.0.1")))) json(res, 404, {});
  });
  try {
    execFileSync("git", ["init", "-q", root]);
    writeFileSync(join(outside, "id_rsa"), "PRIVATE");
    writeFileSync(join(root, "ok.txt"), "fine");
    try {
      symlinkSync(join(outside, "id_rsa"), join(root, "key"));
    } catch {
      return; // Windows without symlink rights
    }
    store.registerProject(root);
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const port = (server.address() as AddressInfo).port;
    const read = async (p: string) =>
      (await (
        await fetch(
          `http://127.0.0.1:${port}/api/file?root=${encodeURIComponent(root)}&path=${encodeURIComponent(p)}`,
        )
      ).json()) as { content: string | null };
    assert.equal((await read("ok.txt")).content, "fine");
    assert.equal((await read("key")).content, null);
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
