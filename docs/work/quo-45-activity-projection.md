# QUO-45 — project turns, declarations and subagent trees

QUO-45 advances vision pillar P3, Observable activity and subagents. It adds a
pure, versioned projection over retained v2 activity evidence.

## Delivered

- Turns group only explicit project, session and turn identifiers; their declaration
  list names retained plans, decisions, approvals and corrections without copying
  captured text into the derived view.
- Parent and spawned-child references form a deterministic subagent tree. The view
  keeps concurrent child sessions separate even when their turn identifiers match.
- Missing parent, child and session-end evidence remain explicit gaps with the
  rule and supporting evidence IDs. Late arrival produces the same result once all
  retained observations are read.

## Boundary

The projection never derives a relationship from timestamps or similar text, and
it does not establish intent, actual concurrency, correctness or hidden reasoning.
V1 evidence remains retained but lacks the v2 activity identifiers needed for this
view.

## Validation

The focused test interleaves two child sessions sharing a turn ID, adds a late
parent and missing end, verifies deterministic output under reordered input, and
validates the projection contract.
