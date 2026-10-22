# Verification evidence

Open **Sessions → Handle an empty cache response → Review → Verification evidence**. The panel lists the commands recorded in the session and what is actually known about their results.

## What is a fact here

Every recorded command produces one observation with independent, nullable facts:

| Fact | Meaning |
| --- | --- |
| Command | The recorded command text, or `null` when content capture was disabled. |
| Result | Whether a matching result observation exists. |
| Exit code | The reported exit code, or `null` when the source did not report one. |
| Counts | Parsed passed/failed/total counts, or `null` when the output format is not recognised. |
| State | `Recorded pass`, `Recorded failure`, `Counts unknown` or `Result missing`. |

A missing result is not a failure. An exit code of 0 is not a pass when the recorded output reports failing assertions. Unrecognised output stays unknown instead of being guessed at. The parser recognises one narrow format only — a `Tests: N failed, M passed` summary line with `FAIL`/`×` failure markers — under the rule `fixture-test-counts/v1`. Other runners stay unsupported.

## Rules and uncertainty

The projection uses these versioned rules, all recorded on every emitted edge:

| Rule | Edge |
| --- | --- |
| `explicit-prompt-id/v1` | A request and a tool call carrying the same explicit prompt ID. |
| `same-session-tool-id/v1` | A tool request and the result carrying the same explicit tool ID. |
| `prior-file-reference/v1` | A path referenced before a recorded check. |
| `post-check-file-reference/v1` | A path referenced after a recorded check. |
| `snapshot-window/v1` | The repository capture that bounds when a check was recorded. |
| `recorded-command-check/v1` | The check observation itself. |

A referenced path is not authorship, and reference order is not coverage. A path referenced after a recorded result marks that check as possibly stale. A dirty capture window, a missing baseline or an unrecognised output keeps the situation explicitly ambiguous.

## What is not claimed

The panel does not claim that the feature works, that a check covered a particular file, that the agent changed a file, or that no other verification happened. A session with no recorded command result says exactly that: absence of a recorded check is not evidence that no testing happened.

Rebuilding the projection from the same retained observations yields the same result and never alters the recorded history.

## Bounds and API

`GET /v1/projects/:project/sessions/:session/summary` includes a `verification` block with the checks, their relations, the rule and the overall uncertainty. The browser receives it through the protected local session; the panel renders it beside the session document, and **Recorded result** opens the retained event in the evidence inspector. The parser reads at most 64 KiB of the tail of a recorded output; file scope is capped at 50 references per check.

## Validation

`tests/checks.test.ts` covers the parser, exit-zero with failing assertions, unsupported output, missing results, post-check edits, foreign-session results, dirty and missing capture windows, relation contracts and deterministic rebuilds. The browser suite covers the panel, its states, the source link and the empty-session wording.
