import assert from "node:assert/strict";
import { test } from "node:test";
import { handleWaitlist, KEY } from "../api/waitlist.ts";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://quoli.example/api/waitlist", {
    method: "POST",
    headers: {
      host: "quoli.example",
      origin: "https://quoli.example",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const env = { KV_REST_API_URL: "https://redis.example", KV_REST_API_TOKEN: "synthetic-token" };

test("a valid signup is stored once in the Redis hash, keeping the first join time", async () => {
  const calls: { url: string; body: unknown; auth: string | null }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: JSON.parse(String(init.body)),
      auth: new Headers(init.headers).get("authorization"),
    });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const res = await handleWaitlist(post({ email: " Dev@Example.com " }), env, send);
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { saved: true });
  assert.equal(calls[0].url, "https://redis.example");
  assert.equal(calls[0].auth, "Bearer synthetic-token");
  const [cmd, key, email] = calls[0].body as string[];
  assert.deepEqual([cmd, key, email], ["HSETNX", KEY, "dev@example.com"]);
});

test("without a connected database the form says the waitlist is not open, never saved", async () => {
  const res = await handleWaitlist(post({ email: "dev@example.com" }), {});
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /isn't open yet/);
});

test("bad input, cross-site posts, other methods and storage errors are refused honestly", async () => {
  const fail = (async () => new Response("", { status: 500 })) as typeof fetch;
  assert.equal((await handleWaitlist(post({ email: "nope" }), env)).status, 400);
  assert.equal((await handleWaitlist(post("{bad"), env)).status, 400);
  assert.equal((await handleWaitlist(post({ email: "a".repeat(3000) }), env)).status, 413);
  assert.equal(
    (
      await handleWaitlist(
        post({ email: "dev@example.com" }, { origin: "https://evil.example" }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleWaitlist(
        post({ email: "dev@example.com" }, { "content-type": "text/plain" }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (await handleWaitlist(new Request("https://quoli.example/api/waitlist"), env)).status,
    405,
  );
  assert.equal((await handleWaitlist(post({ email: "dev@example.com" }), env, fail)).status, 503);
});
