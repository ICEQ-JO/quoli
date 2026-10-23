# QUO-46 — Claude adapter v2 migration

QUO-46 advances P2/P3 by moving the existing Claude Code hook bridge onto the
compatible v2 evidence envelope.

## Delivered

- The bridge emits v2 evidence with `unreported` source version because the hook
  payload lacks it, plus adapter identity, raw tool name and normalized category.
- Every event declares activity IDs as unavailable and plans, decisions,
  approvals and corrections as unsupported. It does not invent turn, subagent or
  declaration evidence.
- Existing hook event mappings, delivery IDs, reversible installation and
  synthetic source-shaped fixtures remain unchanged.

## Verification boundary

On 2026-10-23, the installed CLI reported 2.1.309 and Anthropic's current hook
reference was reviewed. No paid or private session was run. The adapter remains
pinned to the only runtime shape exercised in the disposable synthetic fixture:
Claude Code 2.1.306 on Linux x64. Newer hook events and any changed payload
shape remain unsupported until separately verified.

## Validation

The conformance and bridge suite validates every retained fixture against the
v2 schema, including adapter/source metadata, explicit capability gaps and raw
tool identity. Installation remains covered by the reversible settings test.
