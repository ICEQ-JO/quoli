# Understanding code in Quoli

Roadmap **Phase 2 — Deeper code**, [#50](https://github.com/ICEQ-JO/quoli/issues/50), [#52](https://github.com/ICEQ-JO/quoli/issues/52) and [#53](https://github.com/ICEQ-JO/quoli/issues/53). The Code lens uses real indexed source and deliberate expansion in place of hop columns. The interaction follows the owner-approved request-to-data direction inspired by Nodeway.

## Try it

Run `pnpm demo` and open the local pairing link Quoli prints. Choose the **shop** project, then **Code**. No session is required. Open **POST /orders/**, reveal **What this uses**, select its handler, reveal and select `createOrder`, then reveal its calls and write to `orders`. Select any connection to read its source. **Who uses this** explores the reverse direction. **Fit exploration** brings the revealed working set into view; selecting or expanding keeps existing node positions. **Project overview** clears that working set.

Search finds indexed functions, routes and tables, plus files from the existing file map. Files without indexed symbols still open in the reader. `/` focuses search; `o` opens the selected source in VS Code. Relationship buttons provide a keyboard path alongside the canvas. Browser back/forward and reload restore the selected item. The expanded working set lives in memory while the Code lens remains mounted; reload or leaving the lens rebuilds it from the selection.

Choose the synthetic **Add refunds** session to see recorded edited files and source matches. The existing source reader exposes **Agent edits**, **Git diff** when a working-tree diff exists, and the original recorded action in Agents. Replay filters activity; the source graph continues to describe current files, not a historical snapshot. A test importing the selected file is a source relationship, not evidence of a test run.

## Discovery and limits

The existing Tree-sitter symbol/import/call engine is retained. New route discovery recognizes directly imported Hono/Express constructors and literal HTTP registrations, named/imported or inline handlers, and literal direct router mounts. FastAPI/Flask constructor imports and route decorators are recognized. Dynamic mount prefixes retain a local path with an unresolved-prefix label. Dynamic route paths, complex registration chains, Python router mounts, re-exported router mounts, middleware execution order and runtime dispatch are not resolved.

SQL discovery reads `CREATE TABLE` declarations in local `.sql` files and literal database `exec`, `prepare`, `query` or `execute` arguments. Literal SQL references link reads/writes to a uniquely declared table. Duplicate declarations stay unlinked; dynamic SQL and queries starting with `WITH` are skipped. ORM models, migrations' effective state, triggers and computed query builders are not inferred. This lexical scan is not a full SQL parser. Column metadata describes the declaration, not the live database.

Source files and SQL files each have a 5,000-file scan budget; files over 512 KB, generated code and paths resolving outside the repository are skipped. Existing partial-index indicators remain visible. Exploration reveals up to 12 related nodes at a time, at most 120; the relationship list still exposes source connections. Existing nodes do not move and every relationship between visible nodes is retained, including cycles and cross-links. The graph is derived from current source; successful calls do not prove execution of a feature or exclusive file authorship.

All analysis stays local. The facts cache stores identifiers and source locations, never literal SQL values or complete SQL statements. No new dependency, paid API, cloud call or source execution was added.

## Design reference and evaluation

`pnpm prototype` still opens the isolated authored teaching example at `http://127.0.0.1:4490/prototype/index.html`. It is a design reference, excluded from production builds. Its fixtures are synthetic and manually connected; the production Code lens uses the real graph API.

With a person unfamiliar with the repository, ask them to find where an order enters and is stored, explain its calculation, locate its test, then distinguish source relationships from recorded execution. Human comprehension and screen-reader evaluation remain outstanding. The separate privacy/recording findings from the readiness audit remain prerequisites for inviting students to install recording; this code-exploration change does not resolve them.

## Validation

Engine and map regression tests cover route-to-data paths, aliases/mounts, negative SQL cases, cache privacy, nested calls, repository symlink boundaries, stable positions, cycles and cross-links. Local full suite: 232/233 pass; the disconnect-status assertion at `tests/app.test.ts:82` fails here and on unchanged main (`receiving` instead of `not_connected`). Typecheck, lint, production build and browser results are recorded in the pull request. Browser checks use only the local synthetic demo. No real private sessions were uploaded or replayed.
