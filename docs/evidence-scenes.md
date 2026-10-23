# Evidence-scene contract

A scene is a bounded, deterministic projection of retained evidence: the native, versioned form behind the Story, Impact, Cost and Timeline views. This page defines the v1 contract ([QUO-55](https://linear.app/quolii/issue/QUO-55/v19-define-the-versioned-evidence-scene-contract)). It adds no scene view and no new producer.

## Where it lives

| Piece | Path |
| --- | --- |
| Contract and validation | `packages/schema/src/scene.ts` (`@traceframe/schema/scene`) |
| Change-map compatibility bridge | `packages/analysis/src/scene.ts` |
| Synthetic fixtures | `fixtures/scenes.ts` |
| Tests | `tests/scene.test.ts` |

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

## Validation

`tests/scene.test.ts` covers all vocabulary kinds, old-map conversion without stronger claims, deterministic output, uncited and unexplained claims, dangling edges, duplicate ids, cap enforcement, an incompatible version, and deleted evidence. `fixtures/scenes.ts` holds the synthetic legacy map and the full-vocabulary scene; no private session or real path is used.

## Not delivered

- No scene UI, Story/Impact/Cost/Timeline view or export.
- No producer emits `symbol`, `hunk`, `decision`, `subagent` or `cost` nodes yet; those arrive with the syntax-aware diff, activity-tree and cost issues.
- No Mermaid/SVG export; native scene data stays the source of truth.
