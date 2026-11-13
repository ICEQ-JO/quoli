# Quoli journal — Phase 1

Issue [#182](https://github.com/ICEQ-JO/quoli/issues/182), built on the landing identity
in #159 / PR #160. This is a public editorial surface, separate from private evidence.

## Pages and implementation

- `/journal/` — illustrated index.
- `/journal/beyond-the-diff/` — DHH’s context observation, verification and the connected review workflow.
- `/journal/the-work-after-generation/` — generation speed, reported review effort and a measurable handoff.
- `/journal/activity-is-not-impact/` — activity/cost versus outcomes, with contrasting experiments and METR’s update.

`web/src/landing/articles.tsx` holds typed editorial content and curated primary
sources. `Journal.tsx` provides the index, article layout, contents, citations and
related reading. `JournalArt.tsx` supplies original decorative SVG plates; it is
not product evidence. Styling extends the established landing tokens in
`journal.css`. See [journal-design.md](journal-design.md).

`scripts/journal.ts` is a small Vite plugin. It serves the pages in development and
emits full static HTML at build time, using the landing HTML/client entry. Each
page has its own title, description, canonical URL and Open Graph title/type/URL.
The shared brand image remains the social preview image. Configure
`VITE_PUBLIC_SITE_URL` or the existing Vercel production-domain environment for
absolute canonical/social URLs. Internal navigation uses ordinary links.

Static HTML contains the journal body, source notes and article navigation before
JavaScript loads. The client adds the existing site header/footer and saved theme.
The journal remains readable with JavaScript disabled. It does not fetch sessions,
contact research sites automatically or introduce a CMS, tracking or subscriptions.

The local server redirects slashless journal paths while preserving queries;
unknown article paths return 404. Static content is read before success headers
are sent so missing files cannot crash the preview's error response. Public-only
builds include the journal and account page, excluding the private app entry.

## Editorial rules

Research-backed perspectives are not customer case studies. Do not invent customer
outcomes, endorsements or Quoli efficacy measurements. Research findings support
the problem; whether Quoli improves an outcome requires a separate measured study.

Every cited source has an original URL, publication/research dates where known,
method and limitation. Do not imply a report release date is its collection date.
Optional survey question response counts differ from whole-survey samples.
Surveys describe reported experience; randomized results remain specific to their
participants, tasks, tools and outcome measures. Cite older work as historical.

The DHH quotation is the verified surrounding-context passage at 1:40:37 in the
publisher's transcript. It does not imply endorsement. No unverified Rust keynote
quotation is included. The refund example is explicitly illustrative. The Microsoft
experiments are identified as earlier code-completion research, and METR’s 2025
slowdown is presented with its February 2026 methodological update.

## Validation

170 tests, typecheck, Biome, standard build and public-only build pass. Tests check
static article content, metadata, routes, source anchors and curated source fields.
Live development/production assertions verify direct paths, slash redirects/query
preservation, 404 status and server survival after a missing page. Browser checks
cover index and three articles at 320/390/760/1000/1440px in both themes with no
horizontal overflow, zero axe WCAG A/AA violations, article/citation navigation,
reload, theme switching and reduced motion. A production article and its citation
links were verified with JavaScript disabled. The independent design review's
material fixes were confirmed resolved; it did not independently verify research.

Owner editorial/visual approval and real screen-reader testing remain outstanding.
No publishing or merge is implied by this implementation.
