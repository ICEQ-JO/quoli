import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Store } from "../server/db.ts";
import { collectLink, saveLinkedKey, startLink, waitForLink } from "../server/link.ts";
import { loadSync } from "../server/sync.ts";

const service = { url: "https://example.supabase.co/", anonKey: "anon" };
const KEY = `qk_${"b".repeat(48)}`;

/** A fake account service: approves after `approveAfter` polls. */
function fake({ approveAfter = 1, expire = false } = {}) {
  const calls: { name: string; body: Record<string, string>; headers: Record<string, string> }[] =
    [];
  let hash = "";
  let polls = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const name = String(url).split("/rpc/")[1];
    const body = JSON.parse(String(init?.body));
    calls.push({ name, body, headers: init?.headers as Record<string, string> });
    if (name === "link_start") {
      hash = body.p_code_hash;
      return Response.json("ABCD-EFGH");
    }
    if (name === "link_collect") {
      if (createHash("sha256").update(body.p_code).digest("hex") !== hash || expire) {
        return Response.json({ message: "this link expired; run connect again" }, { status: 400 });
      }
      return Response.json(++polls > approveAfter ? KEY : null);
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

test("a link sends only the hash of its secret, then collects with the secret", async () => {
  const f = fake();
  const link = await startLink(service, { fetchImpl: f.impl, now: 0 });
  assert.equal(link.pair, "ABCD-EFGH");
  assert.equal(link.url, "https://iceq.best/app/?connect=ABCD-EFGH");
  assert.equal(link.expiresAt, 600_000);
  assert.match(f.calls[0].body.p_code_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(f.calls[0].body.p_code_hash, link.code);
  assert.equal(f.calls[0].headers.apikey, "anon");
  assert.equal(await collectLink(service, link, { fetchImpl: f.impl }), null);
  assert.equal(await collectLink(service, link, { fetchImpl: f.impl }), KEY);
});

test("waiting polls until approved, and stops on expiry or cancel", async () => {
  const f = fake({ approveAfter: 2 });
  const link = await startLink(service, { fetchImpl: f.impl });
  assert.equal(await waitForLink(service, link, { fetchImpl: f.impl, every: 1 }), KEY);
  assert.equal(f.calls.filter((c) => c.name === "link_collect").length, 3);

  const gone = fake({ expire: true });
  const old = await startLink(service, { fetchImpl: gone.impl });
  await assert.rejects(waitForLink(service, old, { fetchImpl: gone.impl, every: 1 }), /expired/);

  const never = fake({ approveAfter: 1e9 });
  const l = await startLink(service, { fetchImpl: never.impl });
  let n = 0;
  await assert.rejects(
    waitForLink(service, l, { fetchImpl: never.impl, every: 1, isCancelled: () => ++n > 3 }),
    /cancelled/,
  );
});

test("a collected key is saved and turns Team sync on from now", () => {
  const store = new Store(":memory:");
  const now = new Date("2026-11-12T20:00:00Z");
  saveLinkedKey(store, KEY, now);
  const c = loadSync(store);
  assert.equal(c.key, KEY);
  assert.equal(c.enabled, true);
  assert.equal(c.since, now.toISOString());
  // Linking again keeps the earlier start, so nothing already sent is skipped or re-sent.
  saveLinkedKey(store, `qk_${"c".repeat(48)}`, new Date("2026-11-13T00:00:00Z"));
  assert.equal(loadSync(store).since, now.toISOString());
});
