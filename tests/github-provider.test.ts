import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { githubCommand } from "../apps/cli/src/github";
import { GithubError } from "../packages/repository/src/github";
import { GithubReadError, githubReads } from "../packages/repository/src/github-provider";
import { remoteCache } from "../packages/repository/src/remote-cache";
import { defaultPolicy } from "../packages/schema/src";
import {
  repositoryBlobResultSchema,
  repositoryComparisonResultSchema,
  repositoryTreeResultSchema,
} from "../packages/schema/src/repository";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const TOKEN = "ghu_review";

type Mode = "ok" | "rate-limited" | "denied" | "revoked";

type Config = {
  mode?: Mode;
  treeEntries?: number;
  treeTruncated?: boolean;
  comparePages?: number;
  auth?: string;
};

async function fakeGitHub(config: Config = {}) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      requests.push(url.pathname + url.search);
      const mode = config.mode ?? "ok";
      if ((config.auth ?? `Bearer ${TOKEN}`) !== request.headers.authorization)
        return send(response, 401, { message: "Bad credentials" });
      if (mode === "rate-limited")
        return send(
          response,
          403,
          { message: "API rate limit exceeded" },
          {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 30),
          },
        );
      if (mode === "denied") return send(response, 403, { message: "Resource not accessible" });
      if (mode === "revoked") return send(response, 401, { message: "Bad credentials" });
      if (url.pathname === "/user") return send(response, 200, { login: "octocat", id: 1 });
      if (url.pathname === "/repos/acme/app/pulls/7")
        return send(response, 200, {
          number: 7,
          title: "Synthetic change",
          state: "open",
          draft: false,
          base: { sha: SHA_A, ref: "main" },
          head: { sha: SHA_B, ref: "feature" },
        });
      if (url.pathname === "/repos/acme/app/commits/main")
        return send(response, 200, { sha: SHA_B });
      if (url.pathname === `/repos/acme/app/git/trees/${SHA_B}`) {
        const count = config.treeEntries ?? 2;
        return send(response, 200, {
          sha: SHA_B,
          truncated: config.treeTruncated ?? false,
          tree: [
            { path: "src", mode: "040000", type: "tree", sha: "t1" },
            ...Array.from({ length: count }, (_, index) => ({
              path: `src/file-${index}.ts`,
              mode: "100644",
              type: "blob",
              sha: `blob-${index}`,
            })),
          ],
        });
      }
      if (url.pathname.startsWith("/repos/acme/app/contents/")) {
        const path = decodeURIComponent(url.pathname.slice("/repos/acme/app/contents/".length));
        const ref = url.searchParams.get("ref");
        if (path === "src/a.ts")
          return send(response, 200, {
            type: "file",
            encoding: "base64",
            size: 41,
            content: Buffer.from(
              ref === SHA_A ? "older version" : "export const token = 'ghp_abcdefgh12345678';",
            ).toString("base64"),
          });
        if (path === "src/binary.bin")
          return send(response, 200, {
            type: "file",
            encoding: "base64",
            size: 3,
            content: Buffer.from([0, 1, 2]).toString("base64"),
          });
        if (path === "src/bad.txt")
          return send(response, 200, {
            type: "file",
            encoding: "base64",
            size: 2,
            content: Buffer.from([0xff, 0xfe]).toString("base64"),
          });
        if (path === "src/large.txt")
          return send(response, 200, {
            type: "file",
            encoding: "base64",
            size: 2048,
            content: Buffer.from("x".repeat(2048)).toString("base64"),
          });
        return send(response, 404, { message: "Not Found" });
      }
      if (url.pathname.startsWith("/repos/acme/app/compare/")) {
        const page = Number(url.searchParams.get("page") ?? "1");
        const pages = config.comparePages ?? 1;
        const headers: Record<string, string> = {};
        if (page < pages)
          headers.link = `<http://127.0.0.1${url.pathname}?per_page=100&page=${page + 1}>; rel="next"`;
        const files =
          page === 1
            ? [
                { filename: "src/a.ts" },
                { filename: "src/new.ts", previous_filename: "src/old.ts" },
              ]
            : [{ filename: "src/b.ts" }];
        return send(response, 200, { status: "ahead", files }, headers);
      }
      send(response, 404, { message: "Not Found" });
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    endpoints: { web: base, api: base },
    requests,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}

function send(
  response: import("node:http").ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(value));
}

function tempCache() {
  const directory = mkdtempSync(join(tmpdir(), "quoli-github-cache-"));
  return { directory, cache: remoteCache(directory) };
}

function reads(
  fake: Awaited<ReturnType<typeof fakeGitHub>>,
  cache = tempCache().cache,
  code = true,
  token = TOKEN,
) {
  return githubReads({
    token,
    cache,
    policy: { ...defaultPolicy, code },
    endpoints: fake.endpoints,
  });
}

const request = {
  repository: { provider: "github", repositoryId: "acme/app" },
  revision: {
    requestedRef: null,
    requestedCommit: SHA_B,
    requestedPullRequest: null,
    resolvedRef: null,
    resolvedCommit: SHA_B,
  },
  limits: { maxEntries: 50, maxBytes: 65_536 },
};

test("tree resolves a ref and caps entries", async () => {
  const fake = await fakeGitHub({ treeEntries: 4 });
  const tree = await reads(fake).tree({
    ...request,
    revision: { ...request.revision, requestedCommit: null, requestedRef: "main" },
    limits: { maxEntries: 3, maxBytes: 65_536 },
  });
  repositoryTreeResultSchema.parse(tree);
  assert.equal(tree.state, "truncated");
  assert.equal(tree.entries.length, 3);
  assert.equal(tree.omitted, 2);
  assert.equal(tree.revision.resolvedRef, "main");
  assert.equal(tree.revision.resolvedCommit, SHA_B);
  await fake.close();
});

test("tree reports a truncated GitHub response even without a cap", async () => {
  const fake = await fakeGitHub({ treeEntries: 1, treeTruncated: true });
  const tree = await reads(fake).tree(request);
  assert.equal(tree.state, "truncated");
  assert.equal(tree.omitted, 0);
  await fake.close();
});

test("tree maps rate limits, denial and missing refs to states", async () => {
  const limited = await fakeGitHub({ mode: "rate-limited" });
  const limitedTree = await reads(limited).tree(request);
  assert.equal(limitedTree.state, "rate_limited");
  assert.ok((limitedTree.retryAfterSeconds ?? 0) > 0);
  await limited.close();

  const denied = await fakeGitHub({ mode: "denied" });
  assert.equal((await reads(denied).tree(request)).state, "denied");
  await denied.close();

  const missing = await fakeGitHub();
  assert.equal(
    (
      await reads(missing).tree({
        ...request,
        revision: { ...request.revision, requestedCommit: null, requestedRef: "nope" },
      })
    ).state,
    "missing",
  );
  await missing.close();
});

test("a revoked token is an error rather than a read state", async () => {
  const fake = await fakeGitHub({ mode: "revoked" });
  await assert.rejects(
    reads(fake).tree(request),
    (error: unknown) => error instanceof GithubError && error.code === "revoked",
  );
  await fake.close();
});

test("blob sanitizes content, treats binary and malformed content explicitly", async () => {
  const fake = await fakeGitHub();
  const client = reads(fake);
  const file = await client.blob({ ...request, path: "src/a.ts" });
  repositoryBlobResultSchema.parse(file);
  assert.equal(file.state, "available");
  assert.ok(file.content?.text?.includes("[REDACTED]"));
  assert.ok(!file.content?.text?.includes("ghp_abcdefgh12345678"));
  assert.ok((file.content?.originalBytes ?? 0) > 0);
  assert.equal(
    (await client.blob({ ...request, path: "src/binary.bin" })).content?.state,
    "unsupported",
  );
  assert.equal(
    (await client.blob({ ...request, path: "src/bad.txt" })).content?.state,
    "malformed",
  );
  await fake.close();
});

test("blob content stays disabled without code consent and is re-sanitized from cache", async () => {
  const fake = await fakeGitHub();
  const cache = tempCache();
  const withCode = reads(fake, cache.cache, true);
  const cached = await withCode.blob({ ...request, path: "src/a.ts" });
  assert.ok(cached.content?.text?.includes("export const"));
  const withoutCode = reads(fake, cache.cache, false);
  const disabled = await withoutCode.blob({ ...request, path: "src/a.ts" });
  assert.equal(disabled.content?.state, "disabled");
  assert.equal(disabled.content?.text, null);
  await fake.close();
});

test("excluded paths are not read or cached", async () => {
  const fake = await fakeGitHub();
  const cache = tempCache();
  const client = reads(fake, cache.cache);
  const excluded = await client.blob({ ...request, path: "src/.env" });
  assert.equal(excluded.content?.state, "disabled");
  assert.equal(
    fake.requests.filter((path) => path.includes("%2Eenv") || path.includes(".env")).length,
    0,
  );
  assert.equal(
    cache.cache.read({
      provider: "github",
      repositoryId: "acme/app",
      commit: SHA_B,
      path: "src/.env",
    }),
    null,
  );
  await fake.close();
});

test("oversized blobs are not persisted", async () => {
  const fake = await fakeGitHub();
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
      provider: "github",
      repositoryId: "acme/app",
      commit: SHA_B,
      path: "src/large.txt",
    }),
    null,
  );
  await fake.close();
});

test("a cached blob avoids a second content request and is bound to the commit", async () => {
  const fake = await fakeGitHub();
  const cache = tempCache();
  const client = reads(fake, cache.cache);
  const first = await client.blob({ ...request, path: "src/a.ts" });
  const second = await client.blob({ ...request, path: "src/a.ts" });
  assert.deepEqual(second.content, first.content);
  assert.equal(
    fake.requests.filter((path) => path.startsWith("/repos/acme/app/contents/")).length,
    1,
  );
  const older = await client.blob({
    ...request,
    path: "src/a.ts",
    revision: { ...request.revision, requestedCommit: SHA_A, resolvedCommit: SHA_A },
  });
  assert.equal(older.content?.text, "older version");
  assert.equal(
    fake.requests.filter((path) => path.startsWith("/repos/acme/app/contents/")).length,
    2,
  );
  await fake.close();
});

test("comparison paginates and reports omitted paths", async () => {
  const fake = await fakeGitHub({ comparePages: 2 });
  const pull = await reads(fake).pullRequest(request.repository, 7);
  assert.equal(pull.title, "Synthetic change");
  assert.equal(pull.base.resolvedCommit, SHA_A);
  const comparison = await reads(fake).comparison({
    ...request,
    revision: pull.head,
    base: pull.base,
    head: pull.head,
  });
  repositoryComparisonResultSchema.parse(comparison);
  assert.equal(comparison.state, "available");
  assert.deepEqual(comparison.paths, ["src/a.ts", "src/new.ts", "src/old.ts", "src/b.ts"]);
  assert.equal(comparison.baseCommit, SHA_A);
  assert.equal(comparison.headCommit, SHA_B);

  const capped = await reads(fake).comparison({
    ...request,
    revision: pull.head,
    base: pull.base,
    head: pull.head,
    limits: { maxEntries: 1, maxBytes: 65_536 },
  });
  assert.equal(capped.state, "truncated");
  assert.equal(capped.paths.length, 1);
  assert.equal(capped.omitted, 2);
  await fake.close();
});

test("comparison maps rate limits and missing refs", async () => {
  const limited = await fakeGitHub({ mode: "rate-limited" });
  const comparison = await reads(limited).comparison({
    ...request,
    base: request.revision,
    head: request.revision,
  });
  assert.equal(comparison.state, "rate_limited");
  assert.deepEqual(comparison.paths, []);
  await limited.close();
});

test("cache clearing is scoped by repository and complete on request", () => {
  const cache = tempCache();
  cache.cache.write(
    { provider: "github", repositoryId: "acme/app", commit: SHA_B, path: "src/a.ts" },
    { text: "a", state: "present", originalBytes: 1, categories: ["code"] },
  );
  cache.cache.write(
    { provider: "gitlab", repositoryId: "acme/other", commit: SHA_B, path: "src/a.ts" },
    { text: "b", state: "present", originalBytes: 1, categories: ["code"] },
  );
  assert.equal(cache.cache.clearRepository("github", "acme/app"), 1);
  assert.equal(
    cache.cache.read({
      provider: "github",
      repositoryId: "acme/app",
      commit: SHA_B,
      path: "src/a.ts",
    }),
    null,
  );
  assert.ok(
    cache.cache.read({
      provider: "gitlab",
      repositoryId: "acme/other",
      commit: SHA_B,
      path: "src/a.ts",
    }),
  );
  writeFileSync(join(cache.directory, "unreadable.json"), "not json");
  assert.equal(cache.cache.clear(), 2);
  rmSync(cache.directory, { recursive: true, force: true });
});

test("review lists changed paths, opens one sanitized file and disconnect clears the cache", async () => {
  const fake = await fakeGitHub();
  const dataDir = mkdtempSync(join(tmpdir(), "quoli-github-review-"));
  let value: string | null = JSON.stringify({
    version: 1,
    clientId: "Iv1abc",
    endpoints: fake.endpoints,
    account: { login: "octocat", id: 1 },
    installations: [
      { id: 1, account: "acme", repositorySelection: "all", permissions: { contents: "read" } },
    ],
    token: {
      accessToken: TOKEN,
      accessExpiresAt: null,
      refreshToken: null,
      refreshExpiresAt: null,
    },
    createdAt: "2026-10-25T00:00:00.000Z",
  });
  const store = {
    read: () => value,
    write: (secret: string) => {
      value = secret;
    },
    clear: () => {
      value = null;
    },
  };
  const lines: string[] = [];
  await githubCommand(
    [
      "review",
      "acme/app",
      "--pull",
      "7",
      "--path",
      "src/a.ts",
      "--capture-code",
      "--max-bytes",
      "65536",
    ],
    { store, dataDir, out: (line) => lines.push(line), fetchImpl: fetch },
  );
  const output = lines.join("\n");
  assert.match(output, /Pull request #7: Synthetic change/);
  assert.match(output, /src\/old\.ts/);
  assert.match(output, /Content \(redacted/);
  assert.ok(!output.includes("ghp_abcdefgh12345678"));
  assert.ok(readdirSync(join(dataDir, "github-cache")).some((name) => name.endsWith(".json")));

  lines.length = 0;
  await githubCommand(["disconnect"], { store, dataDir, out: (line) => lines.push(line) });
  assert.equal(value, null);
  assert.match(lines.join("\n"), /cached file\(s\) cleared/);
  assert.equal(readdirSync(join(dataDir, "github-cache")).length, 0);
  rmSync(dataDir, { recursive: true, force: true });
  await fake.close();
});

test("review refuses without a connection and does not contact GitHub", async () => {
  const fake = await fakeGitHub();
  const dataDir = mkdtempSync(join(tmpdir(), "quoli-github-review-"));
  const lines: string[] = [];
  await githubCommand(["review", "acme/app", "--pull", "7"], {
    store: { read: () => null, write: () => {}, clear: () => {} },
    dataDir,
    out: (line) => lines.push(line),
  });
  assert.match(lines.join("\n"), /not connected/);
  assert.equal(fake.requests.length, 0);
  process.exitCode = 0;
  rmSync(dataDir, { recursive: true, force: true });
  await fake.close();
});

test("GitHubReadError is the exported read failure type", () => {
  const error = new GithubReadError("rate_limited", 12);
  assert.equal(error.state, "rate_limited");
  assert.equal(error.retryAfterSeconds, 12);
});
