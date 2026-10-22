# Source reconciliation

The hook bridge and the telemetry receiver produce two independent views of the same session. Traceframe keeps both in the history and reconciles them in a projection that never merges or overwrites an observation.

## What is joined

Only explicit identifiers, and only inside one project:

| Identity | Used for |
| --- | --- |
| The source session id | Keeping the observations of one session together. |
| The source tool invocation id | Joining a reported tool result from the hook and from the telemetry. |
| The source request id | Keeping a reported request as one usage observation. |
| The source prompt id | Linking a reported request to the prompt it belongs to. |

Nothing is joined by text similarity, by a timestamp or by proximity. An observation without an identity stays visible as ambiguous instead of being matched by guesswork.

## What the panel shows

Open **Sessions → a live session → Review → Source reconciliation**.

- **Joined tools**: one logical tool per invocation identity, with the sources that reported it. Two sources reporting the same tool are corroboration, not a second activity.
- **Conflicts**: when the sources disagree about an outcome, the displayed status follows a stated precedence (the hook first, because it observes the tool directly) and the disagreement stays visible.
- **Ambiguous observations**: results without an invocation identity, which cannot be joined.
- **Per-source totals**: what each source reported on its own.
- **The combined total**: the canonical request series, or `—` while an overlap is unresolved.

## What is never done

- Reported usage is never summed across sources, and a counter or status sample is never added to the request series.
- A repeated export of the same request is a duplicate, not a second total.
- A conflicting observation is never resolved by overwriting one side.
- The raw accepted history is never rewritten: the reconciliation is a projection, so late evidence or a producer restart changes the view and not the record.

## Validation

`tests/reconcile.test.ts` covers the two-source join, a visible disagreement, an ambiguous observation with a null combined total, the duplicate and counter handling and the deterministic rebuild. `tests/otel.test.ts` covers the receiver side of the same contract.

See the [hook bridge](hook-bridge.md) and the [reported usage receiver](telemetry-receiver.md) for the two sources.
