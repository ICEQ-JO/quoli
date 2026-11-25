# Code understanding: request-to-data prototype

Roadmap **Phase 2 — Deeper code**, [#50](https://github.com/ICEQ-JO/quoli/issues/50). This is the first increment of the owner-approved code-understanding rework, informed by Nodeway's feature-oriented exploration. It validates an interaction before replacing the production Map.

## Try it

Run `pnpm prototype` from a clone. Vite opens `http://127.0.0.1:4490/prototype/index.html`. This command starts a web development server, not the Quoli recorder. It needs no agent, account, API key or recorded sessions. An existing Quoli install is unaffected.

Choose **Explore POST /orders**. Select a function or table to read its example source beside the request path. **Show calculation** expands `totalCents`; **Show related test** opens its test. Expanded branches remain visible as the selection changes. **Back to previous selection** retraces reader selections; **Project overview** resets the exploration. These are in-page actions; browser history, refresh persistence and shareable selection URLs are not part of this prototype.

The normal `pnpm build` includes `dist/prototype/index.html`. The public landing build excludes it. The production Map and all real-session flows remain unchanged.

## What the example proves

The authored teaching example connects `POST /orders` to `createOrder`, `saveOrder` and the `orders` table, with a calculation branch and a related test. Each connection names its relation and source line. Source and map selections agree; the path and node positions remain stable during exploration. Keyboard focus moves to the reader heading when a selection changes. The map and source have keyboard-scrollable regions; at narrow widths the reader moves below the map.

Source strings and relationships are synthetic, manually authored fixtures, not extracted from the repository. They show static relationships, not runtime order, observed execution, successful tests or proof of feature correctness. No example code is executed by the page. No evidence, cloud or agent APIs are called. The existing theme preference is shared with Quoli; example exploration stays in memory.

## Evaluate with a new user

Give someone unfamiliar with the example these tasks without teaching them the controls:

1. Find where an order enters the application and where it is saved.
2. Explain where the total comes from and what rejects a negative quantity.
3. Find the relevant test, then return to the function you were reading.

Record completion, wrong turns and explanations in their words. Success means they can explain the path and distinguish source evidence from execution evidence. Automated checks cannot establish comprehension; this human evaluation has not been run.

## Next increments

1. Produce trustworthy route, table and read/write relationships for one supported stack (#2), with source locations and explicit resolution limits.
2. Replace the production Map interaction with deliberate expansion and persistent exploration, using real indexed data.
3. Attach recorded agent changes, diffs, prompts and command results to the explored code path.

The privacy and recording bugs found in the readiness audit remain separate prerequisites for inviting students to install recording. This synthetic prototype does not fix them.

## Validation for #50

- Three focused tests pass: exploration/back/reset behavior, relationship source references and the exact displayed cents-calculation example.
- Typecheck and app build pass. Lint exits successfully, with the existing unused `fileOfNode` import warning in `MapLens.tsx`.
- Chromium checks cover overview and expanded exploration in light/dark at 320, 390, 1280 and 1440 px: no page-level overflow and no axe violations in all 16 combinations. Keyboard entry, branch focus, back/reset and stable path positions were checked. Built assets make no external resource requests.
- Local full suite: 223/224 pass. The project-disconnect assertion at `tests/app.test.ts:82` also fails on unchanged main in this environment (13/14 in that test file), reporting `receiving` instead of `not_connected`; it is outside this prototype's code path.
- No real-device, screen-reader or human-comprehension evaluation has been performed.
