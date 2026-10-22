import type { RepositoryFile, RepositorySnapshot } from "../packages/schema/src/repository";

// Authored examples only: these are not snapshots of the user's working tree.
export function demoSnapshots(): {
  sessionId: string;
  reason: "baseline" | "checkpoint";
  snapshot: RepositorySnapshot;
}[] {
  const file = (path: string, text: string | null): RepositoryFile => ({
    path,
    tracked: true,
    staged: false,
    status: "present",
    fingerprint: null,
    content: {
      text,
      state: text === null ? "disabled" : "present",
      originalBytes: text === null ? null : Buffer.byteLength(text),
      categories: ["code"],
    },
  });
  const snapshot = (
    id: string,
    capturedAt: string,
    files: RepositoryFile[],
    dirty: boolean | null,
  ): RepositorySnapshot => ({
    id,
    capturedAt,
    head: null,
    indexIdentity: null,
    state: "observed",
    dirty,
    files,
    omitted: 0,
    warnings: ["Authored synthetic capture; no live repository was observed."],
  });
  const readme = file(
    "README.md",
    "# Example workspace\nLocal changes already existed before this review.\n",
  );
  return [
    {
      sessionId: "session-cache",
      reason: "baseline",
      snapshot: snapshot(
        "snap_demo_cache_before",
        "2026-10-22T09:02:30.000Z",
        [
          file(
            "src/usage/cache.ts",
            "export function cacheRead(usage) {\n  return usage.cache_read_tokens.toLocaleString();\n}\n",
          ),
          file(
            "src/usage/usage.test.ts",
            "test('missing cache count', () => {\n  expect(cacheRead({})).toBe(0);\n});\n",
          ),
          readme,
        ],
        true,
      ),
    },
    {
      sessionId: "session-cache",
      reason: "checkpoint",
      snapshot: snapshot(
        "snap_demo_cache_after",
        "2026-10-22T09:05:45.000Z",
        [
          file(
            "src/usage/cache.ts",
            "export function cacheRead(usage) {\n  return usage.cache_read_tokens ?? null;\n}\n// A missing count is not zero.\n",
          ),
          file(
            "src/usage/usage.test.ts",
            "test('missing cache count', () => {\n  expect(cacheRead({})).toBe(null);\n});\n",
          ),
          readme,
        ],
        true,
      ),
    },
    {
      sessionId: "session-metadata",
      reason: "baseline",
      snapshot: snapshot(
        "snap_demo_metadata_before",
        "2026-10-22T09:00:30.000Z",
        [file("src/private.ts", null)],
        null,
      ),
    },
    {
      sessionId: "session-metadata",
      reason: "checkpoint",
      snapshot: snapshot(
        "snap_demo_metadata_after",
        "2026-10-22T09:01:00.000Z",
        [file("src/private.ts", null)],
        null,
      ),
    },
  ];
}
