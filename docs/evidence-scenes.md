# Evidence-scene contract

A scene is a bounded, deterministic projection of retained evidence: the native, versioned form behind the Story, Impact, Cost and Timeline views. This page defines the v1 contract ([QUO-55](https://linear.app/quolii/issue/QUO-55/v19-define-the-versioned-evidence-scene-contract)) and the first Story producer ([QUO-56](https://linear.app/quolii/issue/QUO-56/v20-generate-story-scenes-and-deterministic-cited-narratives)). It adds no scene view.

## Where it lives

| Piece | Path |
| --- | --- |
| Contract and validation | `packages/schema/src/scene.ts` (`@traceframe/schema/scene`) |
| Change-map compatibility bridge | `packages/analysis/src/scene.ts` |
| Story contract | `packages/schema/src/story.ts` (`@traceframe/schema/story`) |
| Story projection | `packages/analysis/src/story.ts` |
| Synthetic fixtures | `fixtures/scenes.ts`, `fixtures/story.ts` |
| Tests | `tests/scene.test.ts`, `tests/story.test.ts` |

## Vocabulary

The vocabulary is closed. A producer cannot invent a node or edge kind.

| Node kind | Means |
| --- | --- |
| `turn`, `prompt` | A recorded turn and a recorded prompt. |
| `decision` | A decision the source declared, never hidden reasoning. |
| `subagent` | A subagent or child session. |
| `tool` | A recorded tool call. |
| `file`, `symbol`, `hunk` | A captured path, symbol or diff hunk. |
| `check` | A recorded command result. |
| `gap` | A known missing observation. |
| `cost` | A reported or estimated cost figure. |
| `capability` | A capture or field capability state. |

| Edge kind | Means |
| --- | --- |
| `prompted` | A prompt led to a turn. |
| `declared` | A turn declared a decision. |
| `spawned` | A turn spawned a subagent. |
| `invoked` | A subagent or turn invoked a tool. |
| `touched`, `changed` | A tool touched a path; a path changed a hunk. |
| `verified`, `failed` | A recorded check reported success or failure. `verified` never means feature correctness. |
| `cost_of` | A cost figure belongs to a turn or request. |
| `used` | A tool used a capability or extension. |

V1 does not constrain which node kinds an edge may connect; that pairing is a producer responsibility until a later contract version narrows it.

## Every node and edge is cited

Each node and edge carries:

- `basis`: `recorded`, `derived` or `inferred`.
- `rule`: the versioned rule that generated it. Required, never empty.
- `evidenceIds`: at least one retained observation. An uncited factual claim fails validation.
- `uncertainty`: what the claim does not establish. Required, never empty.

The scene itself carries the projection rule, its own uncertainty, the evidence it cites, the capture window and explicit caps. Labels are inert plain text: no HTML, executable content or diagram source.

## Bounds and versioning

- At most 500 nodes and 1,000 edges; the caps are part of the scene.
- `omittedNodes` and `omittedEdges` count everything the source projection had but the scene does not show, whether a cap or a declared conversion gap. The scene uncertainty names the reason.
- `version` is pinned to `1`. An incompatible version fails validation instead of being read approximately.
- Edges that point at a node outside the scene fail validation; so do duplicate node or edge ids and a node list larger than its declared cap.
- `unknownSceneEvidence(scene, known)` reports cited evidence the caller no longer holds, so deletion surfaces instead of silently shrinking the scene.

## Change-map compatibility

The existing [change map](change-map.md) converts through `sceneFromMap`:

- File and check nodes keep their id, label, status and drill-down reference, and are restated as `derived` under the map's own rule. A projection is never upgraded to `recorded`.
- The map's reference edges (`prior-file-reference/v1`, `post-check-file-reference/v1`) do **not** convert. The v1 vocabulary has no kind for "a recorded check referenced this path", and restating them as `verified`, `failed` or `touched` would claim coverage the map explicitly refuses. They are counted in `omittedEdges` and named in the scene uncertainty.
- Conversion is deterministic: the same retained map always produces the same scene.

## Story projection

[QUO-56](https://linear.app/quolii/issue/QUO-56/v20-generate-story-scenes-and-deterministic-cited-narratives) adds the first real scene producer: one session's retained evidence becomes one bounded scene plus a short rule-generated narrative. `story()` takes the project's events, the captured file changes the caller compared, and the capture pair ids; it reads no store, filesystem or command.

- **Chain.** Turn, prompt, decision, subagent, tool, file, check and gap nodes, with `prompted`, `declared`, `spawned` and `invoked` edges. The vocabulary is unchanged.
- **Declared activity.** Only a declared `decision` becomes a `decision` node. Plan, approval and correction declarations have no v1 node kind; they are counted in `omittedNodes` and named in the scene uncertainty instead of being relabelled.
- **No captured prose.** Prompt and decision text is never reproduced. A check label may repeat the recorded command as inert text, as the change map already does.
- **Citations.** Every claim carries a rule, at least one evidence id and an uncertainty. Claims are generated only for nodes the scene kept, so a capped node cannot leave an orphan narrative line.
- **Unknown rationale.** A turn with no retained decision gets a `gap` node (`missing_rationale`) and an `unknown_rationale` claim. The reason is never inferred from the request or the change, and absence is not proof that no decision was made.
- **Conflicts.** Disagreeing results for one tool call keep both check nodes, mark the tool `conflicting`, and add a `conflict` claim; no outcome is selected.
- **Linked sessions.** A session reports only the link its own observations declared. With the whole project's events supplied, the other side resolves; without it, the missing side is an activity gap rather than a silent omission.
- **Missing baseline.** With no capture pair, `window.baselineMissing` is true and no file node or file claim is emitted, even if the caller supplied comparison entries. Both capture IDs are required for file observations. With no capture at all, `window.after` names the last retained observation and the scene uncertainty says so.
- **Recorded gaps.** Source-reported capture-disabled, unsupported-source, missing-result/end and late-arrival gaps retain their evidence and are never filled. Unavailable file observations retain their status without claiming content changed.
- **Bounds.** The scene keeps the v1 500-node/1,000-edge caps; claims are capped by `caps.claims` with `omittedClaims`.

`tests/story.test.ts` covers a synthetic parent/child session for claim citation, interleaved attribution and determinism, absent rationale, conflicting results, a missing baseline, an unresolved child link, deleted evidence via `unknownSceneEvidence`, the claim cap and the empty-input error. `fixtures/story.ts` holds the synthetic events and captured changes; no private session, credential or real prompt is used.

## Validation

`tests/scene.test.ts` covers all vocabulary kinds, old-map conversion without stronger claims, deterministic output, uncited and unexplained claims, dangling edges, duplicate ids, cap enforcement, an incompatible version, and deleted evidence. `fixtures/scenes.ts` holds the synthetic legacy map and the full-vocabulary scene; no private session or real path is used.

## Not delivered

- No scene UI, Story/Impact/Cost/Timeline view or export.
- The Story projection has no collector route or dashboard consumer yet; V21 renders it.
- No producer emits `symbol`, `hunk`, `cost` or `capability` nodes yet.
- No model-generated summaries; narrative claims are rule-generated from retained observations.
- No Mermaid/SVG export; native scene data stays the source of truth.
