# Landing page — Phase 1

Issue [#107](https://github.com/ICEQ-JO/quoli/issues/107), PR [#111](https://github.com/ICEQ-JO/quoli/pull/111).

## Direction

The owner-approved baby-blue identity in [#159](https://github.com/ICEQ-JO/quoli/issues/159)
supersedes the earlier reference-site structural direction. Original pixel scenery and the
working recorder remain, recolored in ice blue, baby blue, denim, midnight and cream.
A continuous hero places the promise and actions beside the scenery; a stepped open Q
and connected pixel form the landing mark. Left-side tabs introduce the product
tour. An original signal valley, four observatory rooms, animated archive field guide
and rounded contour-art footer give the page one illustrated world. The team section
shows local evidence flowing into opt-in summaries, rather than a decorative workspace. See [landing-design.md](landing-design.md).

Jost sans carries explanation and the hero; Jersey 10 carries section headings and
the wordmark. Both are self-hosted under their included OFL licenses.

## Run and entries

    QUOLI_HOME=/tmp/quoli-landing-preview pnpm landing

Open http://127.0.0.1:4420/landing/. Override QUOLI_PORT when needed.
The `/landing` address redirects to `/landing/`, preserving page query parameters.
The main app remains at / with its existing styles. The landing has its own
Vite HTML/React entry and never fetches captured evidence or installs hooks.

Mission, Roadmap and Privacy are actual information views at the same entry
with page=mission, page=roadmap or page=privacy in the query. Normal navigation,
reload and browser history work without changing the application router.
Build both entries with pnpm build. Production preview after building:

    NODE_ENV=production node --import tsx server/main.ts --landing

## Motion and evidence

PixelScene.tsx draws on explicit low-resolution canvases enlarged without smoothing.
The recorder is a physical twin-reel transport with a continuous tape path, guide
rollers, magnetic head, counter, lamps, switches, vents, casing screws, feet and a
printed event strip. Its reels, marks and terminal use the same pure session model
in scene-model.ts. The clock is time-based and preserved across pause/resume.

The recorder observes the entire recording section: on phones its terminal still
progresses while the mechanical drawing is above the viewport. Other scenes stop
offscreen, and all stop in hidden tabs. At the owner’s request there is no floating
page-pause control: decorative animation runs while visible. The walkthrough keeps
its own Pause/Play and Replay controls, without stopping other scenery. Reduced motion draws a
readable final recorder state and stops continuous updates. Terminal and product
data are synthetic and labeled. The terminal shows only the steps reached so far, so it
fills as the session plays; reduced motion shows every step.

## Journal

The public `/journal/` index and three complete articles extend the landing identity
with original pixel plates, readable article layouts and dated primary-source notes.
Header/footer links and a landing teaser connect them to the product. Journal HTML
is rendered at build time for direct links and no-JavaScript reading; the landing
client supplies the shared chrome and theme. See [journal.md](journal.md).

## Product proof and screenshots

The six-tab product tour keeps desktop navigation on the left and a compact mobile
grid. Tabs support arrow keys, Home and End; existing lens deep links still select
the matching tab. Dedicated Usage and Insights sections now demonstrate spend,
cache usage, failures, possible loops and cross-session trends. Captions label all
figures as synthetic demonstrations, not customer benchmarks.

`ProductScreenshot.tsx` reuses the existing retry-once, error and retry-button
behavior across the tour and evidence sections. Theme changes select the matching
image set. Every image opens at full size.

The original six views in `web/public/landing/product/` use WebP with JPEG fallback
at 1600×1000. The new Usage/Insights light/dark images are native 1440×900 JPEG
captures of the current app running `--demo --large`, with no real sessions or user
accounts. No generated chart values or performance claims are substituted for the
real UI. Capture new evidence on an isolated Quoli data directory and avoid regular
server startup refreshing the user's agent integrations; use the landing mode to
skip user-level setup refresh. The synthetic preview is never a capture source for
private sessions.

## Content narrative

The page now explains the problem, recorded review workflow, four lenses, token
usage/spend, failures and Insights, opt-in team summaries, evidence/privacy boundaries,
setup and seven practical FAQs. The content is a review draft, not owner-approved
final copy. The November 13 owner revision replaces the workspace and optical rail
with signal-valley illustrations, rebuilds the team explanation, and adds an animated
keyboard-operable FAQ accordion. One answer opens at a time; hidden answers are inert.

## Developers and engineering teams

The former academic collaboration pitch is replaced with product benefits: review
changes with context, track usage and estimated spend, and see team activity through
opt-in session summaries. The team action links to the existing `/app/` account page.
Prompts, source code, commands and tool output stay local; detailed hosted session
review remains future work. See [teams.md](teams.md) for the delivered summary model.

Quoli is open source under the MIT license (2026-11-14); the License page
(`?page=terms`) summarises it. An optional `VITE_PUBLIC_CONTACT_EMAIL`
adds a workflow contact in the team section and footer. The `#collaborate` anchor is
retained for existing links; visible navigation calls it "For teams".

## Link previews

`web/landing/index.html` carries Open Graph and Twitter tags with `web/public/landing/og.png`
(1200×630, the baby-blue hero and headline). Vite replaces `%SITE%` with
`VITE_PUBLIC_SITE_URL`, or on Vercel with `https://$VERCEL_PROJECT_PRODUCTION_URL` (the
production domain, including a custom one), so previews get an absolute image URL.

## Waitlist

Two handlers share one validator (`shared/waitlist.ts`). Both accept a JSON `email`, require a same-origin Origin and a JSON content type, cap requests at 2 KB, and normalise the address before storing it.

- **Local preview** (`pnpm landing`): `POST /api/waitlist` in `server/waitlist.ts` stores email and joined time in `QUOLI_HOME/waitlist.sqlite`. That file has owner-only permissions and is kept apart from agent evidence.
- **Vercel** (`api/waitlist.ts`, a Vercel Function): writes `HSETNX quoli:waitlist <email> <joined>` through the Upstash REST API. It uses `KV_REST_API_URL`/`KV_REST_API_TOKEN` from the Vercel Marketplace Upstash integration, or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`. Without them it answers 503 "isn't open yet". It never fakes success.

The form reports success only after the address is stored; otherwise it shows a retryable error.

## Deploying (Vercel)

- `vercel.json` builds with `QUOLI_BUILD=landing pnpm build`, which uses only the landing entry, serves `dist/` and redirects `/` to `/landing/`. The local app and the evidence server are never deployed.
- No analytics are included, and no automatic email is sent.
- To use your own domain, add it under the Vercel project's **Settings → Domains**.

Optional settings (Vercel → Settings → Environment Variables, then redeploy):

| Variable | What it does |
| --- | --- |
| `VITE_PUBLIC_CONTACT_EMAIL` | The address behind "Get in touch" in the team section and the footer's Contact link. |
| `VITE_PUBLIC_SITE_URL` | The site's address for link previews. On Vercel the production domain is used automatically. |

The waitlist (now "Get updates") needs **Storage → Upstash for Redis** connected to the project, which provides `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Signups are in the Redis hash `quoli:waitlist`. Preview the site locally with `QUOLI_HOME=/tmp/quoli-landing-preview QUOLI_PORT=4473 pnpm landing` and open http://127.0.0.1:4473/landing/.

Before sending launch updates, the operator still needs to:
- publish a contact address for removal requests (setting `VITE_PUBLIC_CONTACT_EMAIL` shows one in the developer/team section and footer);
- connect an email provider with an unsubscribe link in every message.



Never expose the private evidence server publicly.

## Validation of the baby-blue identity (#159)

Typecheck, production build, Biome and all 165 existing tests passed. Playwright
verified no horizontal overflow at 320, 390, 760, 1000 and 1440px in both themes,
keyboard tab navigation, reduced-motion evidence visibility, and axe-core reported
no WCAG A/AA violations in either theme at 1440px. Synthetic screenshots only; no
real emails submitted, private evidence read, deployment or real-screen-reader test.

Owner refinement in PR #160 restores left-side desktop tour tabs and left-aligned
product copy, and adds original optical-instrument and workbench scenes plus a
square workspace and rounded animated contour footer. The two new drawing tests bring the suite to 167 passing
tests. Browser checks confirm animation progresses, freezes on pause, and stays
static under reduced motion; both themes pass axe and 320–1440px overflow checks.

The latest owner correction restores the large mission link and rounded contour
footer, and replaces the 5:3 workbench drawing with a full 1:1 animated workspace.
The private repository is never exposed, even through a configured repository URL.
Browser assertions verify commercial developer/team copy and no public repository
links; summary-sharing claims are grounded in the current team implementation.

The square scene passes animation, pause and reduced-motion checks. Footer text
was checked against the brightest composited contour shade at WCAG AA contrast.
Both themes pass axe; tested widths from 320 to 1440px have no horizontal overflow.

Content-rebuild validation: 167 tests, typecheck, lint and build passed. Browser
checks covered both themes, no overflow at 320–1440px, axe zero A/AA violations,
keyboard tour and FAQ operation, screenshot loading, forced image-failure recovery
and reduced-motion evidence visibility. Synthetic screenshot capture must not change the user's installed agent integrations.

## November 13 artwork and layout revision

The hero has layered mountains, trees, two signal stations, moving clouds, a cable
packet, waterfall and river highlights. Four observatory rooms replace the optical
rail; the FAQ has its own animated archive console and field guide. All are original
canvas drawings, tested for finite coordinates, deterministic stills and time changes.
The team section now diagrams local evidence → opt-in summaries → team view and
labels the drawing as illustrative. Footer text/hover colors are explicitly light
in either theme, and its contour canvas has reduced opacity. Mobile hero art keeps
its full aspect ratio so the station is not cropped away.

## November 15 panoramic artwork — Phase 1 #14

The full-card hero uses one original 840×420 landscape rather than a separate
right-hand illustration. Faster cable packets, water highlights, birds and the
observatory conduit add energy; the readable recorder timing stays unchanged.
The light page uses softer paper and dark mode deeper midnight, with warmer cream
artwork highlights. A 320px header adjustment and wrapping installation command
keep the narrow layout usable.

Validation: 203 tests pass; typecheck, lint and production build pass (lint retains
an unrelated existing unused-import warning in MapLens.tsx). Chromium checks cover
320, 390, 760, 1000 and 1440px in both themes without page overflow, zero axe
WCAG A/AA violations at 1440px in both themes, moving canvas frames, reduced-motion
stills, CTA focus and keyboard-operated product tabs and FAQ. No deployment,
private evidence access, real-screen-reader or physical low-end-device test.

The owner's follow-up extends #14 to all landing artwork: night-workshop recorder,
working observatories, research plates, team machinery, FAQ archive and animated
survey contours behind the terminal, screenshots and footer. The same shared
research plates improve journal pages. CSS/SVG loops now stop offscreen and in
hidden tabs and honor reduced motion; recorder controls retain their session clock.
Terminal/screenshot arrivals and FAQ expansion are quicker, with 180ms arrow
feedback on primary actions.

Full-page validation: 205 tests pass, including deterministic finite-coordinate
checks for the workshop and contours; typecheck, lint and build pass with the same
pre-existing MapLens unused-import warning. Chromium verified every scene moves
and becomes still for reduced motion, recorder Pause/Play/Replay, offscreen CSS
pause, keyboard tabs/FAQ, journal motion and both-theme 320–1440px layouts. Axe
reports zero WCAG A/AA violations in either theme at 1440px. Desktop/mobile art
screenshots were inspected, and the recorder caption was separated from the bench
to preserve contrast. Physical low-end hardware and real screen readers remain
untested. No deployment or private evidence access.
