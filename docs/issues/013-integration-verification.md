# 013: Verify Claude Code contracts on a declared supported version

Status: published as [GitHub #14](https://github.com/ICEQ-JO/quoli/issues/14); this file is the local reference. Milestone: M4.

## User value

A developer gets an honest compatibility report before enabling live collection.

## Scope

Complete the runtime gate in the capability matrix using a user-authorized disposable repository, current official documentation and sanitized observations. Specify the supported version/platform range, local OTLP encoding, content gates, source identity and gap behavior.

## Non-goals

No production adapter implementation, reading personal sessions, silent settings modification or treating documentation examples as observed results.

## Dependencies

[012](012-retention-deletion.md)

## Acceptance criteria

- [ ] Report separates documented contracts, runtime observations, experimental formats and unsupported/null fields; links official sources and exact tested version.
- [ ] Verify prompt/tool/lifecycle/failure/interruption/resume/parallel behavior plus actual command output/exit-code shapes.
- [ ] Verify authenticated local OTLP delivery, request identity, process identity, overlap and disabled content; select one supported logs encoding.
- [ ] If a required capability fails, explicitly revise scope or leave the milestone blocked; no invented fallback or live usage without a verified source.

## Test plan

Execute the matrix verification checklist; store only sanitized source-shaped examples with expected fields and reproduce using synthetic harnesses where possible.

## Privacy/security considerations

Live tests require explicit authorization outside this planning pass. Use disposable synthetic prompts/code, review exact settings diff and restore configuration afterward.

## Relative size

M
