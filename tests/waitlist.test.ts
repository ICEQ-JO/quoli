import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { normalizeWaitlistEmail, saveWaitlistEmail, waitlistRequest } from "../server/waitlist.ts";

test("waitlist normalizes addresses and rejects malformed or oversized values", () => {
  assert.equal(
    normalizeWaitlistEmail(" Developer+quoli@Example.com "),
    "developer+quoli@example.com",
  );
  for (const value of [
    null,
    {},
    "hello",
    "a@localhost",
    "a@@b.com",
    "a\n@b.com",
    "a@-b.com",
    "a@b..com",
    ".a@b.com",
    "a..b@c.com",
    "<a>@b.com",
    `${"a".repeat(65)}@b.com`,
  ])
    assert.equal(normalizeWaitlistEmail(value), null);
});

test("waitlist writes once, stores no agent evidence, and creates a private database", () => {
  const directory = mkdtempSync(join(tmpdir(), "quoli-waitlist-"));
  const file = join(directory, "waitlist.sqlite");
  try {
    saveWaitlistEmail("synthetic@example.com", file);
    saveWaitlistEmail("synthetic@example.com", file);
    const db = new DatabaseSync(file);
    try {
      assert.deepEqual(
        db
          .prepare("SELECT email FROM waitlist")
          .all()
          .map((row) => row.email),
        ["synthetic@example.com"],
      );
      assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length, 1);
      // Windows has no Unix file modes; the file sits in the user's own profile there.
      if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
    } finally {
      db.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("waitlist API enforces origin, method, JSON and payload limits and handles storage failure", async () => {
  const saved: string[] = [];
  const server = createServer((req, res) => {
    void waitlistRequest(req, res, (email) => {
      if (email === "failure@example.com") throw new Error("synthetic disk failure");
      saved.push(email);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (body: string, headers: Record<string, string> = {}) =>
    fetch(base, {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json", ...headers },
      body,
    });
  try {
    assert.equal((await fetch(base)).status, 405);
    assert.equal(
      (await call('{"email":"a@example.com"}', { Origin: "https://unrelated.example" })).status,
      403,
    );
    assert.equal(
      (await call('{"email":"a@example.com"}', { "Content-Type": "text/plain" })).status,
      403,
    );
    assert.equal((await call("{")).status, 400);
    assert.equal((await call('{"email":"invalid"}')).status, 400);
    assert.equal((await call("x".repeat(2049))).status, 413);
    const response = await call('{"email":" Synthetic@Example.com "}');
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { saved: true });
    assert.deepEqual(saved, ["synthetic@example.com"]);
    const failure = await call('{"email":"failure@example.com"}');
    assert.equal(failure.status, 503);
    assert.match(((await failure.json()) as { error: string }).error, /try again/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
