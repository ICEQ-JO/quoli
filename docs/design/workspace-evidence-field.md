# Evidence Field workspace — QUO-84

Vision: evidence-grounded review and commercial readiness through a coherent, accessible product.

The owner approved **B — Document first** on 2026-10-24, within the previously approved D — Evidence Field identity. [Approved composition](../../.impeccable/mocks/workspace-b.png); [approval and prompt](../../.impeccable/mocks/workspace-b.json). A and C remain comparison probes, not implementation requirements.

## Ingredient inventory

| Comp ingredient | Implementation |
| --- | --- |
| Stable 196px global navigation | Existing semantic aside/navigation, CSS breakpoint collapse |
| Restrained session title | Local Instrument Serif italic; Inter for UI and prose |
| Large captured request and ruled review sections | Existing SessionBrief HTML and real retained evidence |
| Contextual source plane | Existing EvidenceInspector, 300px desktop seam; native dialog on narrow screens |
| Neutral selection and white primary action | Shared light/dark CSS semantic tokens |
| Recorded / derived / unknown distinctions | Existing text labels and evidence roles; restrained blue, amber, green, red |
| Outlined controls | Existing shared SVG Icon component and native inputs |

The mock is a composition guide, not product evidence. Its fabricated search/command palette, Run check action, GitHub Actions provenance, dates and counts are excluded. No captured command is executed. Current data, URLs, source links, paging, consent, keyboard paths and capture controls remain authoritative. Light mode is retained. No new dependency, adapter, synchronization, narrative or cost calculation is introduced.

## Finish evidence

Synthetic captures: [dark review](screenshots/quo-84/review-dark-desktop.png), [light review](screenshots/quo-84/review-light-desktop.png), [dark inspector](screenshots/quo-84/inspector-dark-desktop.png), [light inspector](screenshots/quo-84/inspector-light-desktop.png), [dark 320px review](screenshots/quo-84/review-dark-320.png), [light 320px review](screenshots/quo-84/review-light-320.png), [session register](screenshots/quo-84/sessions-dark-1440.png), [narrow settings](screenshots/quo-84/settings-light-320.png), [narrow gap queue](screenshots/quo-84/queue-light-320.png), [captured changes](screenshots/quo-84/changes-dark-1440.png).

Screenshots use authored synthetic sessions. No evidence content was changed to match the generated comp.

Validation: production build and emitted design-contract marker verified; types and lint pass (17 existing warnings/four infos); 204 unit/integration passes (five release-gated skips); five standalone release passes. The final full browser suite passes all 38 cases, including both-theme contrast, keyboard focus, reduced-motion, native narrow inspection and nine delivered views at desktop/320px. Required PR CI must pass before merge.

The one mechanical detector pass found 51 advisory differences against the previous DESIGN.md (35 type sizes, 11 radii, five neutral depth colors). The implementation-derived design reference now records actual effective rules and residual legacy overrides. [Independent finish review: PASS](quo-84-finish-review.md), with its sole material sidebar-focus finding resolved and confirmed in both themes at desktop/320px. Parent QUO-82 remains open for scope beyond this delivered workspace increment.
