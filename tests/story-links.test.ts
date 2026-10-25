import assert from "node:assert/strict";
import { test } from "node:test";
import { storyEvents, storyFiles } from "../fixtures/story";
import { compareSnapshots } from "../packages/analysis/src/diff";
import { story } from "../packages/analysis/src/story";
import { storyChanges } from "../packages/analysis/src/story-changes";
import type { RepositoryFile, StoredSnapshot } from "../packages/schema/src/repository";
import { unknownSceneEvidence } from "../packages/schema/src/scene";
import { storySchema } from "../packages/schema/src/story";

const content = (text: string): RepositoryFile["content"] => ({
  text,
  state: "present",
  originalBytes: null,
  categories: ["code"],
});

const file = (path: string, text: string): RepositoryFile => ({
  path,
  tracked: true,
  staged: false,
  status: "present",
  content: content(text),
  fingerprint: null,
});

const snapshot = (id: string, files: RepositoryFile[]): StoredSnapshot => ({
  id,
  projectId: "story-project",
  sessionId: "story-root",
  reason: "baseline",
  eventId: `story-obs-${id}`,
  capturedAt: "2026-10-23T10:00:00.000Z",
  head: null,
  indexIdentity: null,
  state: "observed",
  dirty: false,
  files,
  omitted: 0,
  warnings: [],
});

const evidence = { before: "story-obs-before", after: "story-obs-after" };

const comparisonFiles = (
  path = "src/cache.ts",
  before = "export function loadCache() {\n  return 1;\n}\n",
  after = "export function loadCache() {\n  return 2;\n}\n",
) => {
  const comparison = compareSnapshots(
    snapshot("before", [file(path, before)]),
    snapshot("after", [file(path, after)]),
  );
  return storyChanges(comparison.files, evidence);
};

const build = (files: ReturnType<typeof comparisonFiles>) =>
  story({
    projectId: "story-project",
    sessionId: "story-root",
    events: storyEvents(),
    files,
    beforeId: "story-before",
    afterId: "story-after",
  });

const known = () =>
  new Set([
    ...storyEvents().map((event) => event.id),
    ...storyFiles.flatMap((file) => file.evidenceIds),
  ]);

test("changed symbols and exact hunks cite both captured sides and their tool-path link", () => {
  const result = build(comparisonFiles());
  storySchema.parse(result);

  const fileNode = result.scene.nodes.find((node) => node.kind === "file");
  const symbol = result.scene.nodes.find((node) => node.kind === "symbol");
  const hunk = result.scene.nodes.find((node) => node.kind === "hunk");
  assert.ok(fileNode);
  assert.ok(symbol);
  assert.ok(hunk);
  assert.match(symbol.label, /loadCache/);
  assert.match(symbol.label, /^src\/cache\.ts/);
  assert.match(symbol.ref ?? "", /^[a-f0-9]{64}$/);
  assert.equal(symbol.status, "modified");
  assert.match(hunk.label, /src\/cache\.ts · before 2 · after 2/);
  assert.equal(hunk.status, "modified");
  assert.equal(hunk.ref, fileNode.ref);

  const changed = result.scene.edges.filter((edge) => edge.kind === "changed");
  assert.equal(changed.length, 2);
  assert.ok(changed.some((edge) => edge.from === fileNode.id && edge.to === hunk.id));
  assert.ok(changed.some((edge) => edge.from === symbol.id && edge.to === hunk.id));

  const touched = result.scene.edges.filter((edge) => edge.kind === "touched");
  assert.equal(touched.length, 1);
  assert.ok(touched[0].evidenceIds.includes("story-root-call"));
  assert.ok(touched[0].evidenceIds.includes("story-obs-before"));
  assert.ok(touched[0].evidenceIds.includes("story-obs-after"));
  assert.match(touched[0].uncertainty, /does not establish that the call caused the change/);
  assert.equal(
    result.scene.nodes.some((node) => node.label === "file.read"),
    false,
    "the child session's tool path must not join the parent story",
  );

  const kinds = new Set(result.claims.map((claim) => claim.kind));
  for (const kind of ["symbols", "hunks", "attribution"] as const)
    assert.ok(kinds.has(kind), `expected a ${kind} claim`);
  const attribution = result.claims.find((claim) => claim.kind === "attribution");
  assert.match(attribution?.text ?? "", /1 exact tool-path association was retained/);

  const cited = known();
  assert.deepEqual(unknownSceneEvidence(result.scene, cited), []);
  cited.delete("story-obs-before");
  assert.deepEqual(unknownSceneEvidence(result.scene, cited), ["story-obs-before"]);
});

test("a changed path without an exact recorded tool path stays explicitly unattributed", () => {
  const result = build(comparisonFiles("src/cache.ts.bak"));

  assert.equal(
    result.scene.edges.some((edge) => edge.kind === "touched"),
    false,
  );
  const gap = result.scene.nodes.find(
    (node) => node.kind === "gap" && node.status === "unknown_attribution",
  );
  assert.ok(gap);
  assert.match(gap.uncertainty, /not treated as proof/);
  assert.ok(
    result.claims.some(
      (claim) => claim.kind === "gap" && claim.text.includes("No exact recorded tool path matches"),
    ),
  );
  const attribution = result.claims.find((claim) => claim.kind === "attribution");
  assert.match(
    attribution?.text ?? "",
    /0 exact tool-path associations were retained; 1 changed path had no exact recorded match/,
  );
});

test("a renamed path links a recorded old path without claiming causation", () => {
  const comparison = compareSnapshots(
    snapshot("before", [file("src/cache.ts", "export function loadCache() {\n  return 1;\n}\n")]),
    snapshot("after", [file("src/cache.ts", "export function loadCache() {\n  return 2;\n}\n")]),
  );
  const [change] = comparison.files;
  const renamed = {
    ...change,
    path: "src/new-cache.ts",
    beforePath: "src/cache.ts",
    status: "renamed" as const,
  };
  const result = build(storyChanges([renamed], evidence));
  storySchema.parse(result);

  const fileNode = result.scene.nodes.find((node) => node.kind === "file");
  const hunk = result.scene.nodes.find((node) => node.kind === "hunk");
  assert.equal(fileNode?.label, "src/cache.ts -> src/new-cache.ts");
  assert.match(hunk?.label ?? "", /^src\/cache\.ts -> src\/new-cache\.ts · before 2 · after 2/);
  const touched = result.scene.edges.filter((edge) => edge.kind === "touched");
  assert.equal(touched.length, 1);
  assert.equal(touched[0].to, fileNode?.id);
  assert.match(touched[0].uncertainty, /does not establish that the call caused the change/);
});

test("unsupported syntax keeps exact hunks and states the symbol fallback", () => {
  const result = build(
    comparisonFiles("src/cache.py", "def load():\n    return 1\n", "def load():\n    return 2\n"),
  );
  storySchema.parse(result);

  assert.equal(
    result.scene.nodes.some((node) => node.kind === "symbol"),
    false,
  );
  assert.ok(result.scene.nodes.some((node) => node.kind === "hunk"));
  const gap = result.scene.nodes.find(
    (node) => node.kind === "gap" && node.status === "syntax_unavailable",
  );
  assert.ok(gap);
  assert.match(gap.uncertainty, /unsupported/);
  assert.ok(
    result.claims.some(
      (claim) =>
        claim.kind === "gap" && claim.text.includes("Symbol grouping for this path is unsupported"),
    ),
  );
});

test("story changes require retained evidence ids", () => {
  assert.throws(() => storyChanges([], { before: "", after: "" }), /both retained evidence ids/);
});

test("separated changed regions keep separate exact hunks and symbol links", () => {
  const result = build(
    comparisonFiles(
      "src/two.ts",
      "export function a() {\n  return 1;\n}\n\nexport function b() {\n  return 1;\n}\n",
      "export function a() {\n  return 2;\n}\n\nexport function b() {\n  return 3;\n}\n",
    ),
  );
  storySchema.parse(result);

  const hunks = result.scene.nodes.filter((node) => node.kind === "hunk");
  const symbols = result.scene.nodes.filter((node) => node.kind === "symbol");
  assert.equal(hunks.length, 2);
  assert.equal(symbols.length, 2);
  for (const hunk of hunks)
    assert.ok(
      result.scene.edges.some(
        (edge) =>
          edge.kind === "changed" &&
          edge.to === hunk.id &&
          symbols.some((symbol) => symbol.id === edge.from),
      ),
    );
  assert.deepEqual(hunks.map((hunk) => hunk.label).sort(), [
    "src/two.ts · before 2 · after 2",
    "src/two.ts · before 6 · after 6",
  ]);
});

test("added and deleted files keep exact hunks and symbol states", () => {
  const comparison = compareSnapshots(
    snapshot("before", [file("src/gone.ts", "export function gone() {\n  return 1;\n}\n")]),
    snapshot("after", [file("src/new.ts", "export function added() {\n  return 1;\n}\n")]),
  );
  const result = build(storyChanges(comparison.files, evidence));
  storySchema.parse(result);

  assert.deepEqual(
    result.scene.nodes
      .filter((node) => node.kind === "hunk")
      .map((node) => node.status)
      .sort(),
    ["added", "deleted"],
  );
  assert.deepEqual(
    result.scene.nodes
      .filter((node) => node.kind === "symbol")
      .map((node) => node.status)
      .sort(),
    ["added", "deleted"],
  );
});

test("a parse error claims no symbols while preserving the hunk and the gap", () => {
  const result = build(
    comparisonFiles(
      "src/cache.ts",
      "export function broken( {\n  return 1;\n",
      "export function broken( {\n  return 2;\n",
    ),
  );
  storySchema.parse(result);

  assert.equal(
    result.scene.nodes.some((node) => node.kind === "symbol"),
    false,
  );
  assert.ok(result.scene.nodes.some((node) => node.kind === "hunk"));
  const gap = result.scene.nodes.find(
    (node) => node.kind === "gap" && node.status === "syntax_unavailable",
  );
  assert.ok(gap);
  assert.ok(
    result.claims.some(
      (claim) => claim.kind === "gap" && claim.text.includes("Symbol grouping for this path is"),
    ),
  );
});
