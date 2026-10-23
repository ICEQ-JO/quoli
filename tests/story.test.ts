import assert from "node:assert/strict";
import { test } from "node:test";
import { conflictingStoryEvents, storyEvents, storyFiles } from "../fixtures/story";
import { STORY_RULE, story } from "../packages/analysis/src/story";
import { unknownSceneEvidence } from "../packages/schema/src/scene";
import { storySchema } from "../packages/schema/src/story";

const build = (overrides: Partial<Parameters<typeof story>[0]> = {}) =>
  story({
    projectId: "story-project",
    sessionId: "story-root",
    events: storyEvents(),
    files: storyFiles,
    beforeId: "story-before",
    afterId: "story-after",
    ...overrides,
  });

const knownEvidence = (): Set<string> =>
  new Set([
    ...storyEvents().map((event) => event.id),
    ...storyFiles.flatMap((file) => file.evidenceIds),
  ]);

test("a synthetic multi-agent story cites every claim and reproduces no request or decision text", () => {
  const result = build();
  storySchema.parse(result);
  assert.equal(result.rule, STORY_RULE);
  assert.equal(result.scene.rule, STORY_RULE);

  const nodeKinds = new Set(result.scene.nodes.map((node) => node.kind));
  for (const kind of ["turn", "prompt", "decision", "subagent", "tool", "file", "check"] as const)
    assert.ok(nodeKinds.has(kind), `expected a ${kind} node`);
  const edgeKinds = new Set(result.scene.edges.map((edge) => edge.kind));
  for (const kind of ["prompted", "declared", "invoked", "spawned"] as const)
    assert.ok(edgeKinds.has(kind), `expected a ${kind} edge`);

  const claimKinds = new Set(result.claims.map((claim) => claim.kind));
  for (const kind of ["request", "declared", "subagent", "tool", "files", "checks"] as const)
    assert.ok(claimKinds.has(kind), `expected a ${kind} claim`);

  const known = knownEvidence();
  for (const claim of result.claims) {
    assert.ok(claim.text.length > 0);
    assert.equal(claim.rule, STORY_RULE);
    assert.ok(claim.uncertainty.length > 0);
    assert.ok(claim.evidenceIds.length > 0);
    for (const id of claim.evidenceIds) assert.ok(known.has(id), `uncited evidence ${id}`);
  }

  const child = result.scene.nodes.find((node) => node.kind === "subagent");
  assert.equal(child?.status, "spawned");
  assert.match(child?.label ?? "", /story-child/);

  const serialised = JSON.stringify(result);
  for (const captured of [
    "Synthetic request",
    "Synthetic decision text",
    "Synthetic child request",
    "Synthetic read",
  ])
    assert.equal(serialised.includes(captured), false, `story reproduced ${captured}`);
});

test("interleaved activity keeps attribution and rebuilding is deterministic", () => {
  const ordered = build();
  const shuffled = build({ events: [...storyEvents()].reverse() });
  assert.deepEqual(shuffled, ordered);

  assert.equal(
    ordered.scene.nodes.some((node) => node.label === "file.read"),
    false,
  );
  assert.equal(
    ordered.scene.nodes.some((node) => node.status === "parent"),
    false,
  );

  const child = build({ sessionId: "story-child", files: [], beforeId: null });
  assert.equal(child.scene.sessionId, "story-child");
  const parentLink = child.scene.nodes.find((node) => node.kind === "subagent");
  assert.equal(parentLink?.status, "parent");
  assert.match(parentLink?.label ?? "", /story-root/);
  assert.equal(
    child.scene.nodes.some((node) => node.label === "workspace.apply_patch"),
    false,
  );
  assert.ok(child.claims.some((claim) => claim.kind === "subagent"));
});

test("absent rationale stays unknown instead of being inferred", () => {
  const events = storyEvents().filter((event) => event.id !== "story-root-decision");
  const result = build({ events });

  assert.equal(
    result.scene.nodes.some((node) => node.kind === "decision"),
    false,
  );
  const gap = result.scene.nodes.find(
    (node) => node.kind === "gap" && node.status === "missing_rationale",
  );
  assert.ok(gap);
  assert.match(gap.uncertainty, /not proof that no decision was made/);
  const claim = result.claims.find((entry) => entry.kind === "unknown_rationale");
  assert.ok(claim);
  assert.match(claim.text, /unknown/);
  assert.equal(claim.basis, "derived");
  assert.ok(claim.evidenceIds.every((id) => events.some((event) => event.id === id)));
  assert.match(result.scene.uncertainty, /recorded no decision/);
});

test("conflicting results are reported, not resolved", () => {
  const result = build({ events: conflictingStoryEvents() });

  const statuses = [
    ...new Set(
      result.scene.nodes.filter((node) => node.kind === "check").map((node) => node.status),
    ),
  ].sort();
  assert.deepEqual(statuses, ["failed", "passed"]);

  const tool = result.scene.nodes.find((node) => node.label === "workspace.apply_patch");
  assert.equal(tool?.status, "conflicting");

  const claim = result.claims.find((entry) => entry.kind === "conflict");
  assert.ok(claim);
  assert.match(claim.text, /disagree/);
  assert.ok(claim.evidenceIds.includes("story-root-call"));
  assert.ok(claim.evidenceIds.includes("story-root-result"));
  assert.ok(claim.evidenceIds.includes("story-root-result-2"));

  // The narrative never selects one of the disagreeing outcomes.
  assert.equal(
    result.claims.some((entry) => entry.text.includes("passed") && entry.kind === "conflict"),
    false,
  );
});

test("missing evidence stays visible: no baseline, unresolved child, deleted evidence", () => {
  const noBaseline = build({ beforeId: null, files: [] });
  assert.equal(noBaseline.scene.window.baselineMissing, true);
  assert.equal(
    noBaseline.scene.nodes.some((node) => node.kind === "file"),
    false,
  );
  assert.equal(
    noBaseline.claims.some((claim) => claim.kind === "files"),
    false,
  );
  assert.match(noBaseline.scene.uncertainty, /No baseline capture/);

  const parentOnly = build({
    events: storyEvents().filter((event) => event.sessionId === "story-root"),
  });
  assert.ok(
    parentOnly.scene.nodes.some((node) => node.kind === "gap" && node.status === "missing_child"),
  );
  assert.ok(parentOnly.claims.some((claim) => claim.kind === "gap"));

  const complete = build();
  const known = knownEvidence();
  assert.deepEqual(unknownSceneEvidence(complete.scene, known), []);
  known.delete("story-root-decision");
  assert.deepEqual(unknownSceneEvidence(complete.scene, known), ["story-root-decision"]);

  const rebuilt = build({
    events: storyEvents().filter((event) => event.id !== "story-root-decision"),
  });
  assert.equal(
    rebuilt.scene.nodes.some((node) => node.kind === "decision"),
    false,
  );
  assert.equal(
    rebuilt.claims.some((claim) => claim.kind === "declared"),
    false,
  );
  assert.ok(rebuilt.claims.some((claim) => claim.kind === "unknown_rationale"));
});

test("claims stay capped and a story needs retained observations", () => {
  const bounded = build({ claims: 1 });
  storySchema.parse(bounded);
  assert.equal(bounded.claims.length, 1);
  assert.equal(bounded.caps.claims, 1);
  assert.ok(bounded.omittedClaims > 0);

  assert.throws(() => build({ events: [] }), /at least one retained observation/);
});
