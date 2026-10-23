import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedProvider, type RepositoryProvider } from "../packages/repository/src/index";
import { repositoryReadResultSchema } from "../packages/schema/src/repository";

const commit = "a".repeat(40);
const repository = { provider: "fake_remote", repositoryId: "org/repository" };
const revision = {
  requestedRef: "main",
  requestedCommit: null,
  requestedPullRequest: null,
  resolvedRef: "main",
  resolvedCommit: commit,
};

test("provider reads preserve exact revision and caller bounds", async () => {
  let seenLimits: { maxEntries: number; maxBytes: number } | null = null;
  const remote: RepositoryProvider = {
    async tree(request) {
      seenLimits = request.limits;
      return {
        repository: request.repository,
        revision: request.revision,
        state: "truncated",
        omitted: 2,
        retryAfterSeconds: null,
        entries: [{ path: "src/main.ts", kind: "file" }],
      };
    },
    async blob(request) {
      return {
        repository: request.repository,
        revision: request.revision,
        state: "missing",
        omitted: 0,
        retryAfterSeconds: null,
        path: request.path,
        content: null,
      };
    },
    async comparison(request) {
      return {
        repository: request.repository,
        revision: request.head,
        state: "stale",
        omitted: 0,
        retryAfterSeconds: null,
        baseCommit: request.base.resolvedCommit,
        headCommit: request.head.resolvedCommit,
        paths: [],
      };
    },
  };
  const provider = boundedProvider(remote, { maxEntries: 10, maxBytes: 1024 });
  const tree = await provider.tree({ repository, revision });
  assert.deepEqual(seenLimits, { maxEntries: 10, maxBytes: 1024 });
  assert.equal(tree.state, "truncated");
  assert.equal(tree.omitted, 2);
  assert.equal(tree.revision.resolvedCommit, commit);
  const blob = await provider.blob({ repository, revision, path: "missing.ts" });
  assert.equal(blob.state, "missing");
  assert.equal(blob.content, null);
  const comparison = await provider.comparison({
    repository,
    revision,
    base: revision,
    head: revision,
  });
  assert.equal(comparison.state, "stale");
  assert.equal(comparison.baseCommit, commit);
  const overflow = boundedProvider(
    {
      ...remote,
      async tree(request) {
        return {
          ...(await remote.tree(request)),
          entries: Array.from({ length: 11 }, (_, index) => ({
            path: `src/${index}.ts`,
            kind: "file" as const,
          })),
        };
      },
    },
    { maxEntries: 10, maxBytes: 1024 },
  );
  await assert.rejects(() => overflow.tree({ repository, revision }), /entry limit/);
  const oversizedBlob = boundedProvider(
    {
      ...remote,
      async blob(request) {
        return {
          ...(await remote.blob(request)),
          content: {
            text: "x".repeat(1025),
            state: "present",
            originalBytes: null,
            categories: ["code"],
          },
        };
      },
    },
    { maxEntries: 10, maxBytes: 1024 },
  );
  await assert.rejects(
    () => oversizedBlob.blob({ repository, revision, path: "large.ts" }),
    /byte limit/,
  );
});

test("provider result states do not hide retry or selection gaps", () => {
  assert.throws(() =>
    repositoryReadResultSchema.parse({
      repository,
      revision: { ...revision, requestedRef: null, resolvedRef: null, resolvedCommit: null },
      state: "denied",
      omitted: 0,
      retryAfterSeconds: null,
    }),
  );
  assert.throws(() =>
    repositoryReadResultSchema.parse({
      repository,
      revision,
      state: "available",
      omitted: 0,
      retryAfterSeconds: 30,
    }),
  );
  assert.equal(
    repositoryReadResultSchema.parse({
      repository,
      revision,
      state: "rate_limited",
      omitted: 0,
      retryAfterSeconds: 30,
    }).retryAfterSeconds,
    30,
  );
});
