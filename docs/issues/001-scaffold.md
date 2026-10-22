# 001: Run an empty local workspace with a health page

Status: published as [GitHub #2](https://github.com/ICEQ-JO/quoli/issues/2); this file is the local reference. Milestone: M1.

## User value

A developer can start and stop Traceframe locally with one documented command.

## Scope

Create the proposed pnpm workspace and TypeScript package boundaries, Next.js health page, collector health endpoint, pinned compatible runtime/package versions, lifecycle scripts and lockfile. Add a short root README linking the planning pack.

## Non-goals

No agent integration, production collection, cloud services or empty speculative domain implementations.

## Dependencies

None.

## Acceptance criteria

- [x] A clean supported environment can install from the lockfile and start both loopback-bound applications with no paid API.
- [x] The dashboard shows collector availability; shutdown stops both processes and busy ports produce actionable errors.
- [x] Workspace typecheck, lint and a basic health smoke command are documented; runtime data, credentials and local overrides are ignored.

## Test plan

Run a clean install, typecheck and health smoke; exercise occupied ports and graceful shutdown. Confirm documented commands match actual scripts.

## Privacy/security considerations

No telemetry/analytics dependencies or remote runtime assets; health output contains no environment values or filesystem paths.

## Relative size

M

## Implementation checkpoint

Implemented in the local preview; lifecycle tests cover startup, occupied ports, shutdown and restart.
