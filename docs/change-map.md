# Change map

Open **Sessions → Handle an empty cache response → Map**. The map joins the files captured in two repository observations with the checks recorded in the same session. It is a reading view over retained evidence, not a diagram of what the agent "really" did.

## What the map contains

- **Captured files** are the paths that differ between the selected baseline and checkpoint. Unchanged paths are not changes and stay out of the map.
- **Recorded checks** are the commands with a retained result in the session.
- **Connections** exist only where a recorded check referenced a captured path. Each connection states its basis, rule, position and uncertainty, and opens the supporting observations.

Selecting a file opens the captured diff for that path in the same pair. Selecting a check opens its recorded result and uncertainty. Every list entry is a real control, so the whole map works from the keyboard without the graph.

## Rules and limits

| Rule | Meaning |
| --- | --- |
| `prior-file-reference/v1` | The path was referenced before the recorded check. |
| `post-check-file-reference/v1` | The path was referenced after the recorded check. |
| `captured-change-map/v1` | The map projection itself. |

Reference order is not coverage and a reference is not authorship. The map states that explicitly in its own uncertainty line.

The default view is bounded to 100 nodes and 200 edges. When anything is left out, the view says how many nodes and connections were omitted and offers **Show more** up to 500 nodes. Ordering and identifiers are deterministic, so the same retained evidence always produces the same map.

Without two repository captures the map states that it needs a baseline and a checkpoint instead of implying an empty or complete change set. The pair can be chosen explicitly through the URL or the captured-changes view.

## Bounds and API

`POST /v1/projects/:project/sessions/:session/map` accepts `beforeId` and `afterId` (both optional: the two latest captures are used when they are absent), plus `nodes` and `edges` caps. The browser uses the protected `/api/map` proxy with a 4 KiB body limit; credentials stay on the server and no captured content is placed in a URL.

Labels are plain text rendered as inert React content. The graph is a decorative layer over the same data; no remote renderer, embedded captured HTML or repository-wide analysis is involved.

## Validation

`tests/map.test.ts` covers determinism, stable identifiers, unchanged paths staying out, cap boundaries with explicit omissions, missing baselines and the absence of invented connections. The browser suite covers node and connection counts, opening a captured diff from a file, and opening the supporting observation from a connection.
