# Quoli documentation

Quoli's target is a **hosted dashboard connected to coding agents running locally**: cross-harness activity, subagents, costs, extension use, evidence-grounded change scenes, architecture integrity and technical-debt controls. The running code is still a local MVP; cloud delivery is implementation work, not an existing capability.

## Start here

- [Product vision](vision.md): the owner-approved destination and truth/privacy boundaries.
- [Target architecture](architecture.md): connector → cloud ingestion/storage/projections → hosted dashboard; reuse/rebuild boundaries.
- [Decisions](decisions.md): the cloud direction and what still needs deciding.
- [Hosted pilot decisions](hosted-pilot.md): buyer, price, platforms, retention and launch success criteria for the first paid pilot.
- [Delivery roadmap](work/vision-roadmap.md): phases, initial batch and agent coordination.
- [Active issue index](issues/vision/README.md): complete implementation scopes and Quolii Linear links.
- [Current implementation](implementation-progress.md): what runs today, with evidence and limitations.
- [Repository assessment](work/vision-repository-assessment.md): preserve useful code, repair retry privacy, replace narrow contracts.

Work tracking uses only **Quolii** at `linear.app/quolii`; GitHub hosts code and PRs. Follow [repository agreements](../AGENTS.md). The original MVP's GitHub issues are historical records, not the current work queue.

## Current local runtime references

These describe today's local implementation; they are not the target cloud specification.

| Area | References |
| --- | --- |
| Run and develop | [Local demo](local-demo.md), [development/API reference](development.md), [CLI installation/lifecycle](cli.md) |
| Repository capture | [Automatic history](automatic-history.md), [capture](repository-capture.md), [captured changes](captured-changes.md) |
| Evidence analysis | [Checks](verification-evidence.md), [existing change map](change-map.md), [evidence-scene contract](evidence-scenes.md), [source reconciliation](source-reconciliation.md), [live linking](live-linking.md) |
| Claude integration | [Capability matrix](claude-code-capabilities.md), [versioned runtime report](claude-code-runtime-report.md), [hook bridge](hook-bridge.md), [adapter contract](adapters.md), [usage receiver](telemetry-receiver.md), [setup](local-setup.md) |
| Controls and validation | [Capture/lifecycle controls and known limits](lifecycle-controls.md), [local pilot record](pilot-release.md) |
| Current experience | [Session workspace](design/session-workspace.md), [landing](design/landing-page.md), [visual system](../apps/web/DESIGN.md), [product context](../apps/web/PRODUCT.md) |

Historical validation and screenshots remain available in `docs/design` and completed local work records in `docs/work`. Their dated results do not certify the new cloud product. Redundant original issue bodies, the empty-repository plan and obsolete design proposals have been consolidated; see [cleanup decisions](decisions.md).
