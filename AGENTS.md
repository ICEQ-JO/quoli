# Repository working agreements

## Product and architecture

Quoli is the product and repository name (formerly Traceframe). Start with `docs/README.md` for product scope, architecture, evidence requirements and the implementation sequence. Preserve useful existing code and conventions.

The owner's target product direction is [docs/vision.md](docs/vision.md): a hosted SaaS dashboard with consented local connectors, architecture-integrity and technical-debt controls, and cross-agent evidence covering cloud and local repositories, multiple harnesses, observable activity and subagents, token cost, plugin/skill use and evidence-grounded change diagrams. Every new issue and pull request must name the vision pillar or commercial-readiness gate it advances, or obtain explicit owner approval. The vision is target direction only; delivered capability is recorded in [docs/implementation-progress.md](docs/implementation-progress.md).

## Work tracking

- Use only the **Quolii** Linear workspace for work tracking. Do not create, read, update, or link Quoli work in the Documentu-ai Linear workspace. GitHub remains the repository, pull-request and code-review host.
- Before starting a feature or substantive task, create or select a concrete, medium-sized Linear issue. Split oversized work into demonstrable increments and group tiny related tasks into one useful increment.
- Include user value, scope, non-goals, dependencies, acceptance criteria, test plan, privacy/security considerations and relative size M. Link prerequisite Linear issues when available.
- Keep issue status and acceptance criteria current. Deferred ideas may remain local drafts until their scope is approved.

## Branches, pull requests and identity

- Work on a branch and create a pull request when finishing a Linear issue or feature. Reference the Linear issue in the PR description; use `Closes #N` only for an actual GitHub issue that the PR satisfies.
- Do not push completed feature work directly to `main`. The owner's explicitly requested initial repository bootstrap is the one-time exception.
- Use `ICEQ-JO` as both Git author and committer name, with the verified account's GitHub no-reply email (`151853839+ICEQ-JO@users.noreply.github.com`), for commits created by agents. Do not add agent co-author trailers or rewrite unrelated existing authorship.
- Push and perform any authorized merges through the authenticated `ICEQ-JO` account. Verify the active account before writing to GitHub; if unavailable, stop that external action and report it. Do not impersonate this account with other credentials.
- Creating a PR is expected; it is not permission to merge it. Merge only when the owner authorizes it and required checks pass. Check resulting merge/squash identity if a merge is requested.
- PR descriptions explain the final behavior, linked issue, validation and material limitations. Do not claim tests or acceptance criteria passed unless verified.

## Documentation and judgment

- Keep product reference documentation useful and current alongside changes. Update relevant architecture, setup, decisions, limitations and issue links in the same PR.
- Documentation is a revisable working agreement, not unquestionable authority. The owner or an agent may challenge it with evidence and propose an alternative; record accepted changes and their rationale.
- An agent may update routine implementation details within authorized scope. Push back clearly on contradictions or consequential product/security changes rather than silently overriding explicit owner requirements.
- Follow the owner's latest explicit direction over stale documentation, and reconcile the documentation afterward.

## Evidence, privacy and validation

- The append-only event history is the primary record; metrics, explanations and graphs are derived views. Preserve provenance and recorded/derived/inferred distinctions.
- Unsupported values are null. Do not promise complete capture, hidden reasoning, exclusive file authorship or feature correctness from a successful command alone.
- Keep evidence local unless the user explicitly enables project/category cloud synchronization. Capture and upload consent are separate; apply controls and redaction before persistence and transmission, revalidate cloud tenant/device scope, and treat captured text as untrusted data. Never upload existing private sessions merely to test development. Never replay recorded commands or external actions.
- Verify official Claude Code integration contracts and supported runtime behavior before implementing ingestion. Maintain a synthetic fixture path without paid APIs.
- Run checks appropriate to the change, document outcomes and limitations, and never commit credentials, real private sessions or generated runtime data.

## Required skills

- Always load and follow the `ponytail` skill before coding work: prefer the smallest complete, validated change.
- Always load and follow the `ponytail-review` skill before reviewing a change, commit, or pull request.
- Always load and follow the `impeccable` skill for design or UI work.

## Supporting agents

The owner authorizes OpenCode supporting agents using the available free MiniMax model. Verify the installed model identifier rather than assuming a name. Give each implementation task a bounded ownership area and isolated checkout; keep private sessions, credentials and captured user code out of prompts. The primary agent reviews generated code and reruns meaningful checks before integration. Agents do not publish, merge, or change the owner's tool configuration independently.
