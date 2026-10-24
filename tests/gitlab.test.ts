import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gitlabCommand } from "../apps/cli/src/gitlab";
import {
  connectGitlab,
  GitlabError,
  gitlabStatus,
  normalizeGitlabBase,
} from "../packages/repository/src/gitlab";
import { GitlabReadError, gitlabReads } from "../packages/repository/src/gitlab-provider";
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
const TOKEN = "glpat-fake-read-token-123456";

type Mode = "ok" | "rate-limited" | "denied" | "revoked";

type Config = {
  mode?: Mode;
  scopes?: string[];
  active?: boolean;
  revoked?: boolean;
  expiresAt?: string | null;
  treePages?: number;
  compareTimeout?: boolean;
};

async function fakeGitlab(config: Config = {}) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    request.resume();
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push(url.pathname + url.search);
    const mode = config.mode ?? "ok";
    if (request.headers["private-token"] !== TOKEN) {
      send(response, 401, { message: "401 Unauthorized" });
      return;
    }
    if (mode === "rate-limited") {
      send(
        response,
        429,
        { message: "Retry later" },
        { "retry-after": "25", "ratelimit-reset": "25" },
      );
      return;
    }
    if (mode === "denied") {
      send(response, 403, { message: "Forbidden" });
      return;
    }
    if (mode === "revoked") {
      send(response, 401, { message: "401 Unauthorized" });
      return;
    }
    if (url.pathname === "/api/v4/user") {
      send(response, 200, { id: 7, username: "octocat" });
      return;
    }
    if (url.pathname === "/api/v4/personal_access_tokens/self") {
      send(response, 200, {
        scopes: config.scopes ?? ["read_api"],
        active: config.active ?? true,
        revoked: config.revoked ?? false,
        expires_at: config.expiresAt ?? null,
      });
      return;
    }
    if (url.pathname === "/api/v4/projects/acme%2Fapp/merge_requests/7") {
      send(response, 200, {
        iid: 7,
        title: "Synthetic merge request",
        state: "opened",
        draft: false,
        target_branch: "main",
        source_branch: "feature",
        sha: SHA_B,
        diff_refs: { base_sha: SHA_A, head_sha: SHA_B, start_sha: SHA_B },
      });
      return;
    }
    if (url.pathname === "/api/v4/projects/acme%2Fapp/repository/commits/main") {
      send(response, 200, { id: SHA_B });
      return;
    }
    if (url.pathname === "/api/v4/projects/acme%2Fapp/repository/tree") {
      const page = Number(url.searchParams.get("page") ?? "1");
      const pages = config.treePages ?? 1;
      const headers: Record<string, string> =
        page < pages ? { "x-next-page": String(page + 1) } : {};
      const entries =
        page === 1
          ? [
              { id: "t1", name: "src", type: "tree", path: "src", mode: "040000" },
              { id: "b1", name: "a.ts", type: "blob", path: "src/a.ts", mode: "100644" },
            ]
          : [{ id: "b2", name: "b.ts", type: "blob", path: "src/b.ts", mode: "100644" }];
      send(response, 200, entries, headers);
      return;
    }
    if (url.pathname.startsWith("/api/v4/projects/acme%2Fapp/repository/files/")) {
      const encoded = url.pathname
        .slice("/api/v4/projects/acme%2Fapp/repository/files/".length)
        .replace(/\/raw$/, "");
      const path = decodeURIComponent(encoded);
      const ref = url.searchParams.get("ref");
      const body =
        path === "src/a.ts"
          ? Buffer.from(
              ref === SHA_A ? "older version" : "export const token = 'glpat-abcdefgh12345678';",
            )
          : path === "src/binary.bin"
            ? Buffer.from([0, 1, 2])
            : path === "src/bad.txt"
              ? Buffer.from([0xff, 0xfe])
              : path === "src/large.txt"
                ? Buffer.from("x".repeat(2048))
                : null;
      if (body === null) {
        send(response, 404, { message: "404 Not Found" });
        return;
      }
      response.writeHead(200, {
        "content-type": "text/plain",
        "content-length": String(body.length),
      });
      response.end(body);
      return;
    }
    if (url.pathname === "/api/v4/projects/acme%2Fapp/repository/compare") {
      send(response, 200, {
        compare_timeout: config.compareTimeout ?? false,
        compare_same_ref: false,
        diffs: [
          { old_path: "src/a.ts", new_path: "src/a.ts" },
          { old_path: "src/old.ts", new_path: "src/new.ts" },
        ],
      });
      return;
    }
    send(response, 404, { message: "404 Not Found" });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    baseUrl,
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

async function connect(fake: Awaited<ReturnType<typeof fakeGitlab>>, store = memoryStore()) {
  const connection = await connectGitlab({
    token: TOKEN,
    baseUrl: fake.baseUrl,
    store,
    fetchImpl: fetch,
  });
  return { connection, store };
}

function tempCache() {
  const directory = mkdtempSync(join(tmpdir(), "quoli-gitlab-cache-"));
  return { directory, cache: remoteCache(directory) };
}

function reads(
  fake: Awaited<ReturnType<typeof fakeGitlab>>,
  cache = tempCache().cache,
  code = true,
) {
  return gitlabReads({
    token: TOKEN,
    baseUrl: fake.baseUrl,
    cache,
    policy: { ...defaultPolicy, code },
    fetchImpl: fetch,
  });
}

const request = {
  repository: { provider: "gitlab", repositoryId: "acme/app" },
  revision: {
    requestedRef: null,
    requestedCommit: SHA_B,
    requestedPullRequest: null,
    resolvedRef: null,
    resolvedCommit: SHA_B,
  },
  limits: { maxEntries: 50, maxBytes: 65_536 },
};

test("connect stores a read-only token and never prints it", async () => {
  const fake = await fakeGitlab();
  const store = memoryStore();
  const lines: string[] = [];
  const dataDir = mkdtempSync(join(tmpdir(), "quoli-gitlab-"));
  await gitlabCommand(["connect", "--base-url", fake.baseUrl], {
    store,
    stdin: stdin(TOKEN),
    out: (line) => lines.push(line),
    dataDir,
  });
  const output = lines.join("\n");
  assert.match(output, /Connected to http:\/\/127\.0\.0\.1:\d+ as @octocat/);
  assert.ok(!output.includes(TOKEN));
  assert.ok(store.value());
  const status = await gitlabStatus({ store });
  assert.equal(status.state, "connected");
  assert.equal(status.verified, true);
  await fake.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("connect refuses write or missing read scopes without storing a token", async () => {
  for (const scopes of [["api"], ["read_repository"], ["read_api", "write_repository"]]) {
    const fake = await fakeGitlab({ scopes });
    const store = memoryStore();
    await assert.rejects(
      connectGitlab({ token: TOKEN, baseUrl: fake.baseUrl, store }),
      (error: unknown) => error instanceof GitlabError && error.code === "scope",
    );
    assert.equal(store.value(), null);
    await fake.close();
  }
});

test("connect refuses inactive, revoked and expired tokens", async () => {
  for (const config of [{ active: false }, { revoked: true }, { expiresAt: "2020-01-01" }]) {
    const fake = await fakeGitlab(config);
    const store = memoryStore();
    await assert.rejects(
      connectGitlab({ token: TOKEN, baseUrl: fake.baseUrl, store }),
      (error: unknown) => error instanceof GitlabError,
    );
    assert.equal(store.value(), null);
    await fake.close();
  }
});

test("connect fails closed before any network call when the keychain is unavailable", async () => {
  const fake = await fakeGitlab();
  const store = {
    read() {
      throw new KeychainUnavailable();
    },
    write() {},
    clear() {},
  };
  await assert.rejects(
    connectGitlab({ token: TOKEN, baseUrl: fake.baseUrl, store }),
    (error: unknown) => error instanceof KeychainUnavailable,
  );
  assert.equal(fake.requests.length, 0);
  await fake.close();
});

test("base URLs require HTTPS except on loopback", () => {
  assert.equal(normalizeGitlabBase("https://gitlab.com/"), "https://gitlab.com");
  assert.equal(normalizeGitlabBase("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
  for (const value of [
    "http://gitlab.example.com",
    "https://user:secret@gitlab.com",
    "https://gitlab.com/?a=1",
    "not a url",
  ])
    assert.throws(() => normalizeGitlabBase(value), GitlabError);
});

test("status reports revoked and expired tokens and clears them", async () => {
  const revoked = await fakeGitlab({ mode: "revoked" });
  const revokedStore = memoryStore(
    JSON.stringify({
      version: 1,
      baseUrl: revoked.baseUrl,
      account: { id: 7, username: "octocat" },
      token: { accessToken: TOKEN, scopes: ["read_api"], expiresAt: null },
      createdAt: "2026-10-25T00:00:00.000Z",
    }),
  );
  assert.equal((await gitlabStatus({ store: revokedStore })).state, "revoked");
  assert.equal(revokedStore.value(), null);
  await revoked.close();

  const expiredStore = memoryStore(
    JSON.stringify({
      version: 1,
      baseUrl: "https://gitlab.com",
      account: { id: 7, username: "octocat" },
      token: { accessToken: TOKEN, scopes: ["read_api"], expiresAt: "2020-01-01" },
      createdAt: "2026-10-25T00:00:00.000Z",
    }),
  );
  assert.equal((await gitlabStatus({ store: expiredStore })).state, "expired");
  assert.equal(expiredStore.value(), null);
});

test("status keeps an unreachable credential as connected but unverified", async () => {
  const store = memoryStore(
    JSON.stringify({
      version: 1,
      baseUrl: "https://gitlab.example.com",
      account: { id: 7, username: "octocat" },
      token: { accessToken: TOKEN, scopes: ["read_api"], expiresAt: null },
      createdAt: "2026-10-25T00:00:00.000Z",
    }),
  );
  const status = await gitlabStatus({
    store,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(status.state, "connected");
  assert.equal(status.verified, false);
  assert.ok(store.value());
});

test("merge request and tree reads resolve commits, paginate and cap", async () => {
  const fake = await fakeGitlab({ treePages: 2 });
  const client = reads(fake);
  const mergeRequest = await client.mergeRequest(request.repository, 7);
  assert.equal(mergeRequest.title, "Synthetic merge request");
  assert.equal(mergeRequest.base.resolvedCommit, SHA_A);
  assert.equal(mergeRequest.head.resolvedRef, "feature");

  const tree = await client.tree({
    ...request,
    revision: { ...request.revision, requestedCommit: null, requestedRef: "main" },
  });
  repositoryTreeResultSchema.parse(tree);
  assert.equal(tree.state, "available");
  assert.equal(tree.entries.length, 3);
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
    const fake = await fakeGitlab({ mode });
    const tree = await reads(fake).tree(request);
    assert.equal(tree.state, state);
    if (mode === "rate-limited") assert.equal(tree.retryAfterSeconds, 25);
    await fake.close();
  }
  const missing = await fakeGitlab();
  const tree = await reads(missing).tree({
    ...request,
    revision: { ...request.revision, requestedCommit: null, requestedRef: "missing" },
  });
  assert.equal(tree.state, "missing");
  await missing.close();
});

test("a revoked token is an error rather than a read state", async () => {
  const fake = await fakeGitlab({ mode: "revoked" });
  await assert.rejects(
    reads(fake).tree(request),
    (error: unknown) => error instanceof GitlabError && error.code === "revoked",
  );
  await fake.close();
});

test("blob sanitizes GitLab tokens, binary content, malformed UTF-8 and exclusions", async () => {
  const fake = await fakeGitlab();
  const cache = tempCache();
  const client = reads(fake, cache.cache);
  const file = await client.blob({ ...request, path: "src/a.ts" });
  repositoryBlobResultSchema.parse(file);
  assert.equal(file.state, "available");
  assert.ok(file.content?.text?.includes("[REDACTED]"));
  assert.ok(!file.content?.text?.includes("glpat-abcdefgh12345678"));
  assert.equal(
    (await client.blob({ ...request, path: "src/binary.bin" })).content?.state,
    "unsupported",
  );
  assert.equal(
    (await client.blob({ ...request, path: "src/bad.txt" })).content?.state,
    "malformed",
  );

  const excluded = await client.blob({ ...request, path: "src/.env" });
  assert.equal(excluded.content?.state, "disabled");
  assert.equal(fake.requests.filter((path) => path.includes(".env")).length, 0);
  assert.equal(
    cache.cache.read({
      provider: "gitlab",
      repositoryId: "acme/app",
      commit: SHA_B,
      path: "src/.env",
    }),
    null,
  );
  await fake.close();
});

test("oversized blobs are truncated and not cached", async () => {
  const fake = await fakeGitlab();
  const cache = tempCache();
  const client = reads(fake, cache.cache);
  const large = await client.blob({
    ...request,
    path: "src/large.txt",
    limits: { maxEntries: 50, maxBytes: 1024 },
  });
  assert.equal(large.state, "truncated");
  assert.equal(large.content?.text, null);
  assert.equal(
    cache.cache.read({
      provider: "gitlab",
      repositoryId: "acme/app",
      commit: SHA_B,
      path: "src/large.txt",
    }),
    null,
  );
  await fake.close();
});

test("cache hits avoid content requests, respect the commit and reapply policy", async () => {
  const fake = await fakeGitlab();
  const cache = tempCache();
  const client = reads(fake, cache.cache);
  await client.blob({ ...request, path: "src/a.ts" });
  const second = await client.blob({ ...request, path: "src/a.ts" });
  assert.ok(second.content?.text?.includes("[REDACTED]"));
  assert.equal(fake.requests.filter((path) => path.includes("/repository/files/")).length, 1);
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

test("comparison reports renames, capping and GitLab timeouts", async () => {
  const fake = await fakeGitlab();
  const client = reads(fake);
  const mergeRequest = await client.mergeRequest(request.repository, 7);
  const comparison = await client.comparison({
    ...request,
    revision: mergeRequest.head,
    base: mergeRequest.base,
    head: mergeRequest.head,
  });
  repositoryComparisonResultSchema.parse(comparison);
  assert.deepEqual(comparison.paths, ["src/a.ts", "src/old.ts", "src/new.ts"]);
  assert.equal(comparison.state, "available");

  const capped = await client.comparison({
    ...request,
    revision: mergeRequest.head,
    base: mergeRequest.base,
    head: mergeRequest.head,
    limits: { maxEntries: 1, maxBytes: 65_536 },
  });
  assert.equal(capped.state, "truncated");
  assert.equal(capped.omitted, 2);
  await fake.close();

  const timedOut = await fakeGitlab({ compareTimeout: true });
  const timeout = await reads(timedOut).comparison({
    ...request,
    base: request.revision,
    head: request.revision,
  });
  assert.equal(timeout.state, "truncated");
  await timedOut.close();
});

test("comparison maps rate limits to a retry state", async () => {
  const fake = await fakeGitlab({ mode: "rate-limited" });
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
    { provider: "github", repositoryId: "acme/app", commit: SHA_B, path: "src/a.ts" },
    content,
  );
  cache.cache.write(
    { provider: "gitlab", repositoryId: "acme/app", commit: SHA_B, path: "src/a.ts" },
    content,
  );
  assert.ok(cache.cache.clearRepository("gitlab", "acme/app") === 1);
  assert.equal(
    cache.cache.read({
      provider: "gitlab",
      repositoryId: "acme/app",
      commit: SHA_B,
      path: "src/a.ts",
    }),
    null,
  );
  assert.ok(
    cache.cache.read({
      provider: "github",
      repositoryId: "acme/app",
      commit: SHA_B,
      path: "src/a.ts",
    }),
  );
  rmSync(cache.directory, { recursive: true, force: true });
});

test("review lists changed paths, opens a sanitized file and disconnect clears the cache", async () => {
  const fake = await fakeGitlab();
  const { store } = await connect(fake);
  const dataDir = mkdtempSync(join(tmpdir(), "quoli-gitlab-review-"));
  const lines: string[] = [];
  await gitlabCommand(
    [
      "review",
      "acme/app",
      "--merge-request",
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
  assert.match(output, /Merge request !7: Synthetic merge request/);
  assert.match(output, /src\/old\.ts/);
  assert.match(output, /Content \(redacted/);
  assert.ok(!output.includes(TOKEN));
  assert.ok(!output.includes("glpat-abcdefgh12345678"));
  assert.ok(readdirSync(join(dataDir, "gitlab-cache")).some((name) => name.endsWith(".json")));

  lines.length = 0;
  await gitlabCommand(["disconnect"], { store, dataDir, out: (line) => lines.push(line) });
  assert.equal(store.value(), null);
  assert.match(lines.join("\n"), /cached file\(s\) cleared/);
  assert.equal(readdirSync(join(dataDir, "gitlab-cache")).length, 0);
  rmSync(dataDir, { recursive: true, force: true });
  await fake.close();
});

test("review refuses without a connection and makes no request", async () => {
  const fake = await fakeGitlab();
  const dataDir = mkdtempSync(join(tmpdir(), "quoli-gitlab-review-"));
  const lines: string[] = [];
  await gitlabCommand(["review", "acme/app", "--merge-request", "7"], {
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

test("GitlabReadError is the exported read failure type", () => {
  const error = new GitlabReadError("rate_limited", 25);
  assert.equal(error.state, "rate_limited");
  assert.equal(error.retryAfterSeconds, 25);
});
