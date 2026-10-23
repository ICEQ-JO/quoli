import assert from "node:assert/strict";
import { test } from "node:test";
import { legacyMap, vocabularyScene } from "../fixtures/scenes";
import { sceneFromMap } from "../packages/analysis/src/scene";
import { changeMapSchema } from "../packages/schema/src/map";
import {
  SCENE_VERSION,
  type Scene,
  sceneEdgeKindSchema,
  sceneNodeKindSchema,
  sceneSchema,
  unknownSceneEvidence,
} from "../packages/schema/src/scene";

const copy = (scene: Scene): Scene => structuredClone(scene);

test("the fixture scene uses every declared vocabulary kind and validates", () => {
  sceneSchema.parse(vocabularyScene);
  assert.deepEqual(
    new Set(vocabularyScene.nodes.map((node) => node.kind)),
    new Set(sceneNodeKindSchema.options),
  );
  assert.deepEqual(
    new Set(vocabularyScene.edges.map((edge) => edge.kind)),
    new Set(sceneEdgeKindSchema.options),
  );
  assert.equal(vocabularyScene.version, SCENE_VERSION);
});

test("a valid legacy change map converts without a stronger claim", () => {
  changeMapSchema.parse(legacyMap);
  const scene = sceneFromMap(legacyMap, { projectId: "demo-quoli", sessionId: "session-fixture" });
  sceneSchema.parse(scene);

  assert.deepEqual(
    scene.nodes.map((node) => node.id),
    legacyMap.nodes.map((node) => node.id),
  );
  for (const node of scene.nodes) {
    const source = legacyMap.nodes.find((candidate) => candidate.id === node.id);
    assert.ok(source);
    assert.equal(node.label, source.label);
    assert.equal(node.status, source.status);
    assert.equal(node.ref, source.ref);
    // A projection is never restated as a recorded fact.
    assert.equal(node.basis, "derived");
    assert.equal(node.rule, legacyMap.rule);
    assert.ok(node.uncertainty.length > 0);
  }
  const withoutUncertainty = scene.nodes.find((node) => node.id === "f-src-app");
  assert.ok(withoutUncertainty);
  assert.match(withoutUncertainty.uncertainty, /No node-specific uncertainty/);

  // Reference edges have no honest v1 kind, so they are counted, not restated.
  assert.equal(scene.edges.length, 0);
  assert.equal(scene.omittedEdges, legacyMap.omittedEdges + legacyMap.edges.length);
  assert.match(scene.uncertainty, /counted as omitted/);
});

test("the conversion is deterministic", () => {
  const ids = { projectId: "demo-quoli", sessionId: "session-fixture" };
  assert.deepEqual(sceneFromMap(legacyMap, ids), sceneFromMap(legacyMap, ids));
});

test("uncited or unexplained claims fail validation", () => {
  const uncited = copy(vocabularyScene);
  uncited.nodes[0].evidenceIds = [];
  assert.equal(sceneSchema.safeParse(uncited).success, false);

  const unruled = copy(vocabularyScene);
  unruled.edges[0].rule = "";
  assert.equal(sceneSchema.safeParse(unruled).success, false);

  const unexplained = copy(vocabularyScene);
  unexplained.nodes[0].uncertainty = "";
  assert.equal(sceneSchema.safeParse(unexplained).success, false);
});

test("dangling edges and duplicate ids fail validation", () => {
  const dangling = copy(vocabularyScene);
  dangling.edges[0].from = "n-missing";
  assert.equal(sceneSchema.safeParse(dangling).success, false);

  const duplicated = copy(vocabularyScene);
  duplicated.nodes[1].id = duplicated.nodes[0].id;
  assert.equal(sceneSchema.safeParse(duplicated).success, false);
});

test("caps are explicit and enforced", () => {
  const overCap = copy(vocabularyScene);
  overCap.caps.nodes = 1;
  assert.equal(sceneSchema.safeParse(overCap).success, false);

  const consistent = copy(vocabularyScene);
  consistent.omittedNodes = 7;
  consistent.omittedEdges = 3;
  sceneSchema.parse(consistent);
});

test("an incompatible scene version is rejected", () => {
  const future = { ...copy(vocabularyScene), version: 2 };
  assert.equal(sceneSchema.safeParse(future).success, false);
});

test("deleted evidence is reported instead of shrinking the scene silently", () => {
  const known = new Set(["obs-before", "obs-after", "check-1", "ref-1", "ref-2"]);
  assert.deepEqual(unknownSceneEvidence(vocabularyScene, known), []);

  known.delete("obs-after");
  assert.deepEqual(unknownSceneEvidence(vocabularyScene, known), ["obs-after"]);
});
