import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bitbucketCommand } from "../apps/cli/src/bitbucket";
import {
  BitbucketError,
  bitbucketAuthorization,
  bitbucketStatus,
  connectBitbucket,
  normalizeBitbucketApi,
} from "../packages/repository/src/bitbucket";
import { BitbucketReadError, bitbucketReads } from "../packages/repository/src/bitbucket-provider";
import { remoteCache } from "../packages/repository/src/remote-cache";
import { defaultPolicy } from "../packages/schema/src";
import {
  repositoryBlobResultSchema,
  repositoryComparisonResultSchema,
  repositoryTreeResultSchema,
} from "../packages/schema/src/repository";
import { KeychainUnavailable } from "../packages/storage/src/keychain";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const EMAIL = "local@example.com";
const TOKEN = "atlassian-api-token-local-123456";

type Mode = "ok" | "rate-limited" | "denied" | "revoked";

type Config = {
  mode?: Mode;
  treePages?: number;
  diffPages?: number;
};

async function fakeBitbucket(config: Config = {}) {
  const requests: string[] = [];
  let baseUrl = "";
  const server = createServer((request, response) => {
    request.resume();
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push(url.pathname + url.search);
    const mode = config.mode ?? "ok";
    if (request.headers.authorization !== bitbucketAuthorization(EMAIL, TOKEN)) {
      send(response, 401, { error: { message: "Unauthorized" } });
      return;
    }
    if (mode === "rate-limited") {
      send(response, 429, { error: { message: "Too many requests" } }, { "retry-after": "25" });
      return;
    }
    if (mode === "denied") {
      send(response, 403, { error: { message: "Forbidden" } });
      return;
    }
    if (mode === "revoked") {
      send(response, 401, { error: { message: "Unauthorized" } });
      return;
    }
    const prefix = "/2.0/repositories/acme/app";
    if (url.pathname === "/2.0/user") {
      send(response, 200, { uuid: "{local-uuid}", display_name: "Local User" });
      return;
    }
    if (url.pathname === `${prefix}/pullrequests/7/diffstat`) {
      const page = Number(url.searchParams.get("page") ?? "1");
      const pages = config.diffPages ?? 1;
      const values =
        page === 1
          ? [
              { old: { path: "src/a.ts" }, new: { path: "src/a.ts" } },
              { old: { path: "src/old.ts" }, new: { path: "src/new.ts" } },
            ]
          : [{ old: { path: "src/extra.ts" }, new: { path: "src/extra.ts" } }];
      send(response, 200, {
        pagelen: values.length,
        values,
        ...(page < pages
          ? {
              next: `${baseUrl}/2.0/repositories/acme/app/pullrequests/7/diffstat?page=${page + 1}`,
            }
          : {}),
      });
      return;
    }
    if (url.pathname === `${prefix}/pullrequests/7`) {
      send(response, 200, {
        id: 7,
        title: "Synthetic pull request",
        state: "OPEN",
        draft: false,
        source: { branch: { name: "feature" }, commit: { hash: SHA_B } },
        destination: { branch: { name: "main" }, commit: { hash: SHA_A } },
      });
      return;
    }
    if (url.pathname === `${prefix}/refs/branches/main`) {
      send(response, 200, { name: "main", target: { hash: SHA_B } });
      return;
    }
    if (url.pathname === `${prefix}/src/${SHA_B}/`) {
      const page = Number(url.searchParams.get("page") ?? "1");
      const pages = config.treePages ?? 1;
      const values =
        page === 1
          ? [
              { type: "commit_directory", path: "src" },
              { type: "commit_file", path: "src/a.ts", attributes: "" },
            ]
          : [{ type: "commit_file", path: "src/b.ts", attributes: "" }];
      send(response, 200, {
        pagelen: values.length,
        values,
        ...(page < pages
          ? { next: `${baseUrl}/2.0/repositories/acme/app/src/${SHA_B}/?page=${page + 1}` }
          : {}),
      });
      return;
    }
    if (url.pathname.startsWith(`${prefix}/src/`)) {
      const remainder = url.pathname.slice(`${prefix}/src/`.length);
      const sha = remainder.slice(0, remainder.indexOf("/"));
      const rest = remainder.slice(remainder.indexOf("/") + 1);
      if (sha !== SHA_A && sha !== SHA_B) {
        send(response, 404, { error: { message: "Not found" } });
        return;
      }
      const meta = url.searchParams.get("format") === "meta";
      const file = (size: number, attributes = "") =>
        send(response, 200, { type: "commit_file", path: rest, size, attributes });
      if (rest === "src/a.ts") {
        if (meta) return file(sha === SHA_A ? 13 : 38);
        if (sha === SHA_A) {
          response.writeHead(200, { "content-type": "text/plain", "content-length": "13" });
          response.end("older version");
          return;
        }
        const body = Buffer.from("const token = 'glpat-abcdefgh12345678';");
        response.writeHead(200, {
          "content-type": "text/plain",
          "content-length": String(body.length),
        });
        response.end(body);
        return;
      }
      if (rest === "src/binary.bin") return meta ? file(3, "binary") : send(response, 200, {});
      if (rest === "src/link") return meta ? file(4, "link") : send(response, 200, {});
      if (rest === "src/sub") return meta ? file(0, "subrepository") : send(response, 200, {});
      if (rest === "src/large.txt") return meta ? file(2048) : send(response, 200, {});
      if (rest === "src/bad.txt") {
        if (meta) return file(2);
        const body = Buffer.from([0xff, 0xfe]);
        response.writeHead(200, { "content-type": "text/plain", "content-length": "2" });
        response.end(body);
        return;
      }
      if (rest === "src/dir") {
        return send(response, 200, { type: "commit_directory", path: rest });
      }
      send(response, 404, { error: { message: "Not found" } });
      return;
    }
    if (url.pathname === `${prefix}/diffstat/${SHA_A}..${SHA_B}`) {
      const page = Number(url.searchParams.get("page") ?? "1");
      const pages = config.diffPages ?? 1;
      const values =
        page === 1
          ? [
              { old: { path: "src/a.ts" }, new: { path: "src/a.ts" } },
              { old: { path: "src/old.ts" }, new: { path: "src/new.ts" } },
            ]
          : [{ old: { path: "src/extra.ts" }, new: { path: "src/extra.ts" } }];
      send(response, 200, {
        pagelen: values.length,
        values,
        ...(page < pages
          ? {
              next: `${baseUrl}/2.0/repositories/acme/app/diffstat/${SHA_A}..${SHA_B}?page=${page + 1}`,
            }
          : {}),
      });
      return;
    }
    send(response, 404, { error: { message: "Not found" } });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    baseUrl,
    apiUrl: `${baseUrl}/2.0`,
    requests,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}

function send(
  response: ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(value));
}

function memoryStore(initial: string | null = null) {
  let value = initial;
  return {
    read: () => value,
    write: (secret: string) => {
      value = secret;
    },
    clear: () => {
      value = null;
    },
    value: () => value,
  };
}

async function* stdin(value: string) {
  yield Buffer.from(value);
}

async function connect(fake: Awaited<ReturnType<typeof fakeBitbucket>>, store = memoryStore()) {
  const connection = await connectBitbucket({
    email: EMAIL,
    token: TOKEN,
    apiUrl: fake.apiUrl,
    store,
  });
  return { connection, store };
}

function tempCache() {
  const directory = mkdtempSync(join(tmpdir(), "quoli-bitbucket-cache-"));
  return { directory, cache: remoteCache(directory) };
}

function reads(
  fake: Awaited<ReturnType<typeof fakeBitbucket>>,
  cache = tempCache().cache,
  code = true,
) {
  return bitbucketReads({
    email: EMAIL,
    token: TOKEN,
    apiUrl: fake.apiUrl,
    cache,
    policy: { ...defaultPolicy, code },
  });
}

const request = {
  repository: { provider: "bitbucket", repositoryId: "acme/app" },
  revision: {
    requestedRef: null,
    requestedCommit: SHA_B,
    requestedPullRequest: null,
    resolvedRef: null,
    resolvedCommit: SHA_B,
  },
  limits: { maxEntries: 50, maxBytes: 65_536 },
};

test("connect stores the email and API token and never prints the token", async () => {
  const fake = await fakeBitbucket();
  const store = memoryStore();
  const lines: string[] = [];
  const dataDir = mkdtempSync(join(tmpdir(), "quoli-bitbucket-"));
  await bitbucketCommand(["connect", "--email", EMAIL], {
    store,
    stdin: stdin(TOKEN),
    apiUrl: fake.apiUrl,
    out: (line) => lines.push(line),
    dataDir,
  });
  const output = lines.join("\n");
  assert.match(output, /Connected to Bitbucket Cloud as Local User/);
  assert.ok(!output.includes(TOKEN));
  const saved = store.value();
  assert.ok(saved?.includes(EMAIL));
  const status = await bitbucketStatus({ store });
  assert.equal(status.state, "connected");
  assert.equal(status.verified, true);
  await fake.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("connect refuses an invalid email or token without a request", async () => {
  const fake = await fakeBitbucket();
  const store = memoryStore();
  await assert.rejects(
    connectBitbucket({ email: "not-an-email", token: TOKEN, apiUrl: fake.apiUrl, store }),
    (error: unknown) => error instanceof BitbucketError && error.code === "invalid",
  );
  await assert.rejects(
    connectBitbucket({ email: EMAIL, token: "short", apiUrl: fake.apiUrl, store }),
    (error: unknown) => error instanceof BitbucketError && error.code === "invalid",
  );
  assert.equal(fake.requests.length, 0);
  assert.equal(store.value(), null);
  await fake.close();
});

test("connect fails closed before any network call when the keychain is unavailable", async () => {
  const fake = await fakeBitbucket();
  const store = {
    read() {
      throw new KeychainUnavailable();
    },
    write() {},
    clear() {},
  };
  await assert.rejects(
    connectBitbucket({ email: EMAIL, token: TOKEN, apiUrl: fake.apiUrl, store }),
    (error: unknown) => error instanceof KeychainUnavailable,
  );
  assert.equal(fake.requests.length, 0);
  await fake.close();
});

test("API URLs require HTTPS except on loopback", () => {
  assert.equal(
    normalizeBitbucketApi("https://api.bitbucket.org/2.0/"),
    "https://api.bitbucket.org/2.0",
  );
  assert.equal(normalizeBitbucketApi("http://127.0.0.1:8080/2.0"), "http://127.0.0.1:8080/2.0");
  for (const value of [
    "http://api.bitbucket.org/2.0",
    "https://user:secret@api.bitbucket.org/2.0",
    "https://api.bitbucket.org/2.0?a=1",
    "not a url",
  ])
    assert.throws(() => normalizeBitbucketApi(value), BitbucketError);
});

test("status clears a rejected token and keeps an unreachable one unverified", async () => {
  const revoked = await fakeBitbucket({ mode: "revoked" });
  const revokedStore = memoryStore(
    JSON.stringify({
      version: 1,
      apiUrl: revoked.apiUrl,
      account: { uuid: "{local-uuid}", displayName: "Local User" },
      token: { email: EMAIL, accessToken: TOKEN },
      createdAt: "2026-10-26T00:00:00.000Z",
    }),
  );
  assert.equal((await bitbucketStatus({ store: revokedStore })).state, "revoked");
  assert.equal(revokedStore.value(), null);
  await revoked.close();

  const offlineStore = memoryStore(
    JSON.stringify({
      version: 1,
      apiUrl: "https://api.bitbucket.org/2.0",
      account: { uuid: "{local-uuid}", displayName: "Local User" },
      token: { email: EMAIL, accessToken: TOKEN },
      createdAt: "2026-10-26T00:00:00.000Z",
    }),
  );
  const status = await bitbucketStatus({
    store: offlineStore,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(status.state, "connected");
  assert.equal(status.verified, false);
  assert.ok(offlineStore.value());
});

test("pull request and tree reads resolve commits, paginate and cap", async () => {
  const fake = await fakeBitbucket({ treePages: 2 });
  const client = reads(fake);
  const pullRequest = await client.pullRequest(request.repository, 7);
  assert.equal(pullRequest.title, "Synthetic pull request");
  assert.equal(pullRequest.base.resolvedCommit, SHA_A);
  assert.equal(pullRequest.head.resolvedRef, "feature");

  const tree = await client.tree({
    ...request,
    revision: { ...request.revision, requestedCommit: null, requestedRef: "main" },
  });
  repositoryTreeResultSchema.parse(tree);
  assert.equal(tree.state, "available");
  assert.deepEqual(tree.entries, [
    { path: "src", kind: "directory" },
    { path: "src/a.ts", kind: "file" },
    { path: "src/b.ts", kind: "file" },
  ]);
  assert.equal(tree.revision.resolvedCommit, SHA_B);

  const capped = await client.tree({ ...request, limits: { maxEntries: 1, maxBytes: 65_536 } });
  assert.equal(capped.state, "truncated");
  assert.equal(capped.entries.length, 1);
  assert.equal(capped.omitted, 1);
  await fake.close();
});

test("tree maps rate limits, denial and missing refs", async () => {
  for (const [mode, state] of [
    ["rate-limited", "rate_limited"],
    ["denied", "denied"],
  ] as const) {
    const fake = await fakeBitbucket({ mode });
    const tree = await reads(fake).tree(request);
    assert.equal(tree.state, state);
    if (mode === "rate-limited") assert.equal(tree.retryAfterSeconds, 25);
    await fake.close();
  }
  const missing = await fakeBitbucket();
  const tree = await reads(missing).tree({
    ...request,
    revision: { ...request.revision, requestedCommit: null, requestedRef: "missing" },
  });
  assert.equal(tree.state, "missing");
  await missing.close();
});

test("a rejected token is an error rather than a read state", async () => {
  const fake = await fakeBitbucket({ mode: "revoked" });
  await assert.rejects(
    reads(fake).tree(request),
    (error: unknown) => error instanceof BitbucketError && error.code === "revoked",
  );
  await fake.close();
});

test("blob reads reject directories, links, submodules, binary and malformed content", async () => {
  const fake = await fakeBitbucket();
  const client = reads(fake);
  const text = await client.blob({ ...request, path: "src/a.ts" });
  repositoryBlobResultSchema.parse(text);
  assert.equal(text.state, "available");
  assert.ok(text.content?.text?.includes("[REDACTED]"));
  assert.ok(!text.content?.text?.includes("glpat-abcdefgh12345678"));
  for (const path of ["src/dir", "src/link", "src/sub", "src/binary.bin"])
    assert.equal((await client.blob({ ...request, path })).content?.state, "unsupported", path);
  assert.equal(
    (await client.blob({ ...request, path: "src/bad.txt" })).content?.state,
    "malformed",
  );
  assert.equal((await client.blob({ ...request, path: "src/missing.txt" })).state, "missing");
  await fake.close();
});

test("excluded paths are never requested or cached", async () => {
  const fake = await fakeBitbucket();
  const cache = tempCache();
  const blob = await reads(fake, cache.cache).blob({ ...request, path: "src/.env" });
  assert.equal(blob.content?.state, "disabled");
  assert.equal(fake.requests.filter((path) => path.includes(".env")).length, 0);
  assert.equal(
    cache.cache.read({
      provider: "bitbucket",
      repositoryId: "acme/app",
      commit: SHA_B,
      path: "src/.env",
    }),
    null,
  );
  await fake.close();
});

test("oversized metadata truncates before a content request", async () => {
  const fake = await fakeBitbucket();
  const cache = tempCache();
  const blob = await reads(fake, cache.cache).blob({
    ...request,
    path: "src/large.txt",
    limits: { maxEntries: 50, maxBytes: 1024 },
  });
  assert.equal(blob.state, "truncated");
  assert.equal(blob.content?.text, null);
  assert.equal(
    fake.requests.filter((path) => path.includes("src/large.txt") && !path.includes("meta")).length,
    0,
  );
  assert.equal(
    cache.cache.read({
      provider: "bitbucket",
      repositoryId: "acme/app",
      commit: SHA_B,
      path: "src/large.txt",
    }),
    null,
  );
  await fake.close();
});

test("cache hits avoid requests, respect the commit and reapply the policy", async () => {
  const fake = await fakeBitbucket();
  const cache = tempCache();
  const client = reads(fake, cache.cache);
  await client.blob({ ...request, path: "src/a.ts" });
  const second = await client.blob({ ...request, path: "src/a.ts" });
  assert.ok(second.content?.text?.includes("[REDACTED]"));
  assert.equal(fake.requests.filter((path) => path.includes("src/a.ts")).length, 2);
  const older = await client.blob({
    ...request,
    path: "src/a.ts",
    revision: { ...request.revision, requestedCommit: SHA_A, resolvedCommit: SHA_A },
  });
  assert.equal(older.content?.text, "older version");
  const withoutCode = reads(fake, cache.cache, false);
  const disabled = await withoutCode.blob({ ...request, path: "src/a.ts" });
  assert.equal(disabled.content?.state, "disabled");
  assert.equal(disabled.content?.text, null);
  await fake.close();
});

test("comparison paginates, caps and reports rename paths", async () => {
  const fake = await fakeBitbucket({ diffPages: 2 });
  const client = reads(fake);
  const comparison = await client.comparison({
    ...request,
    base: { ...request.revision, requestedCommit: SHA_A, resolvedCommit: SHA_A },
    head: request.revision,
  });
  repositoryComparisonResultSchema.parse(comparison);
  assert.deepEqual(comparison.paths, ["src/a.ts", "src/old.ts", "src/new.ts", "src/extra.ts"]);
  assert.equal(comparison.state, "available");

  const capped = await client.comparison({
    ...request,
    base: { ...request.revision, requestedCommit: SHA_A, resolvedCommit: SHA_A },
    head: request.revision,
    limits: { maxEntries: 2, maxBytes: 65_536 },
  });
  assert.equal(capped.state, "truncated");
  assert.equal(capped.paths.length, 2);
  assert.equal(capped.omitted, 1);

  const pr = await client.comparison({
    ...request,
    revision: { ...request.revision, requestedPullRequest: "7" },
    base: { ...request.revision, requestedCommit: SHA_A, resolvedCommit: SHA_A },
    head: request.revision,
  });
  assert.deepEqual(pr.paths, ["src/a.ts", "src/old.ts", "src/new.ts", "src/extra.ts"]);
  assert.ok(fake.requests.some((path) => path.includes("/pullrequests/7/diffstat")));
  await fake.close();
});

test("comparison maps rate limits to a retry state", async () => {
  const fake = await fakeBitbucket({ mode: "rate-limited" });
  const comparison = await reads(fake).comparison({
    ...request,
    base: request.revision,
    head: request.revision,
  });
  assert.equal(comparison.state, "rate_limited");
  assert.equal(comparison.retryAfterSeconds, 25);
  assert.deepEqual(comparison.paths, []);
  await fake.close();
});

test("cache entries are separate for the same repository on different providers", () => {
  const cache = tempCache();
  const content = {
    text: "x",
    state: "present" as const,
    originalBytes: 1,
    categories: ["code" as const],
  };
  cache.cache.write(
    { provider: "gitlab", repositoryId: "acme/app", commit: SHA_B, path: "src/a.ts" },
    content,
  );
  cache.cache.write(
    { provider: "bitbucket", repositoryId: "acme/app", commit: SHA_B, path: "src/a.ts" },
    content,
  );
  assert.ok(cache.cache.clearRepository("bitbucket", "acme/app") === 1);
  assert.equal(
    cache.cache.read({
      provider: "bitbucket",
      repositoryId: "acme/app",
      commit: SHA_B,
      path: "src/a.ts",
    }),
    null,
  );
  assert.ok(
    cache.cache.read({
      provider: "gitlab",
      repositoryId: "acme/app",
      commit: SHA_B,
      path: "src/a.ts",
    }),
  );
  rmSync(cache.directory, { recursive: true, force: true });
});

test("review lists changed paths, opens a sanitized file and disconnect clears the cache", async () => {
  const fake = await fakeBitbucket();
  const { store } = await connect(fake);
  const dataDir = mkdtempSync(join(tmpdir(), "quoli-bitbucket-review-"));
  const lines: string[] = [];
  await bitbucketCommand(
    [
      "review",
      "acme/app",
      "--pull-request",
      "7",
      "--path",
      "src/a.ts",
      "--capture-code",
      "--max-bytes",
      "65536",
    ],
    { store, dataDir, out: (line) => lines.push(line) },
  );
  const output = lines.join("\n");
  assert.match(output, /Pull request #7: Synthetic pull request \(OPEN\)/);
  assert.match(output, /src\/old\.ts/);
  assert.match(output, /Content \(redacted/);
  assert.ok(!output.includes(TOKEN));
  assert.ok(!output.includes("glpat-abcdefgh12345678"));
  assert.ok(fake.requests.some((path) => path.includes("/pullrequests/7/diffstat")));
  assert.ok(readdirSync(join(dataDir, "bitbucket-cache")).some((name) => name.endsWith(".json")));

  lines.length = 0;
  await bitbucketCommand(["disconnect"], { store, dataDir, out: (line) => lines.push(line) });
  assert.equal(store.value(), null);
  assert.match(lines.join("\n"), /cached file\(s\) cleared/);
  assert.equal(readdirSync(join(dataDir, "bitbucket-cache")).length, 0);
  rmSync(dataDir, { recursive: true, force: true });
  await fake.close();
});

test("review refuses without a connection and makes no request", async () => {
  const fake = await fakeBitbucket();
  const dataDir = mkdtempSync(join(tmpdir(), "quoli-bitbucket-review-"));
  const lines: string[] = [];
  await bitbucketCommand(["review", "acme/app", "--pull-request", "7"], {
    store: memoryStore(),
    dataDir,
    out: (line) => lines.push(line),
  });
  assert.match(lines.join("\n"), /not connected/);
  assert.equal(fake.requests.length, 0);
  process.exitCode = 0;
  rmSync(dataDir, { recursive: true, force: true });
  await fake.close();
});

test("BitbucketReadError is the exported read failure type", () => {
  const error = new BitbucketReadError("rate_limited", 25);
  assert.equal(error.state, "rate_limited");
  assert.equal(error.retryAfterSeconds, 25);
});
