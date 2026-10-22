# Decisions requiring founder input

This page records the earlier MVP-stage proposals. The current target direction and its open decisions are in the [product vision](vision.md); keep the two pages reconciled when a decision is made.

These are proposed defaults so implementation can proceed after approval; they are not decisions already made by the founder.

| Decision | Recommendation | Consequence / when needed |
| --- | --- | --- |
| Initial supported platforms | Linux and macOS local CLI/browser pilot; defer Windows certification | Narrows setup, permission and Git behavior tests. Confirm before 001 and 013. |
| Meaning of “SaaS” for this first release | Validate a local developer tool first, with no hosted account or upload | Cloud architecture and monetization remain later decisions. Confirm before committing launch positioning. |
| Capture and retention defaults | Metadata-only; opt into prompts, tool content and code independently; 30-day configurable retention | Rich diffs need code consent; content-free sessions remain useful but less detailed. Confirm before 003/012. |
| Visual-understanding depth | File/session/check map with direct evidence and diff drill-down | Symbol graphs and runtime behavior analysis are outside MVP. Confirm before 010/011. |
| Live integration installation | User-reviewed project-local bridge configuration; preserve existing hooks/export destinations | Managed-policy conflicts may prevent capture. Confirm before 018; verification happens first in 013. |
| Pilot target and success signal | A small single-developer pilot: can users identify what changed and which evidence is missing without rereading the whole agent session? | Agree a qualitative review script before 019; no productivity score or automatic analytics upload. |

The owner subsequently authorized connecting `ICEQ-JO/quoli` and using medium-sized GitHub issues with PRs for completed work. The remote is now configured and the 19 MVP issues are published. These workflow choices are recorded in [AGENTS.md](../AGENTS.md); the product decisions above remain proposals. Live service installation and Claude Code settings have not been changed.
