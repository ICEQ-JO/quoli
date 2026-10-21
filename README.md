# quoli

**Traceframe** is a local-first observability and visual-understanding tool for AI-assisted development.

> Show me what my coding agent did, what changed, and what remains unverified.

It connects available Claude Code session evidence, tool activity, reported token/cache usage, Git changes and command/test results into an inspectable timeline, diffs and a bounded change map. Every relationship carries evidence and uncertainty.

The project is currently in planning. No application scaffold or live collector has been implemented.

- [Product plan and reference documentation](docs/README.md)
- [Architecture](docs/architecture.md)
- [Implementation backlog](docs/issues/README.md)
- [Claude Code capabilities and limitations](docs/claude-code-capabilities.md)
- [Contributor and agent working agreements](AGENTS.md)

The MVP runs locally, has no outbound session upload and needs no paid API for its synthetic demonstration. Billing, teams and cloud synchronization are outside MVP scope.
