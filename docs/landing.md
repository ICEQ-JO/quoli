# Landing page — Phase 1

Issue: [#107](https://github.com/ICEQ-JO/quoli/issues/107).

The owner commissioned a complete replacement of the historical landing page:
original pixel scenery, characters, display lettering and motion, with the reference site as
the aesthetic reference. The audience is developers across coding-agent tools
and engineering teams; the main action is joining the waitlist. The broader
audience is a product direction, not a claim that team or additional adapters ship today.

## Run and structure

Run this with an isolated preview data directory:

    QUOLI_HOME=/tmp/quoli-landing-preview pnpm landing

Open http://127.0.0.1:4420/landing/. Change the port with QUOLI_PORT.
The build command builds both the main app and landing entry. After building,
production serving uses:

    NODE_ENV=production node --import tsx server/main.ts --landing

- web/landing/index.html: metadata and visual-direction contract.
- web/src/landing/: isolated React entry, page, interactive SVG station model and CSS.
- web/public/landing/: self-hosted Jersey 10 / DM Sans (OFL licenses included),
  original generated pixel city, courier and cottage. Prompt sidecars preserve provenance.
- .impeccable/mocks/comp-a.png: selected composition under the owner's delegated
  creative control; its illustrative copy is not factual product evidence.
- server/waitlist.ts: signup handler and dedicated SQLite storage.

The page never imports app styles, fetches private sessions, or installs hooks.
The four-lens explorer and summary are explicitly synthetic. Stations and tabs
control the same selection; arrow keys/Home/End work in the tablist. Animations
pause outside the viewport and stop under reduced motion. The detailed art is
a raster illustration; the station geometry, signals and controls are code.

## Waitlist

POST /api/waitlist accepts an email JSON field, returns 201 only after saving,
and deduplicates normalized addresses. It requires a matching same-origin
Origin and JSON content type, permits at most 2 KB, validates the address and
stores only email/joined timestamp in QUOLI_HOME/waitlist.sqlite.
The file is created with owner-only permissions. Agent evidence is separate.
No email is sent automatically; the page explains storage and this preview limitation.
A failure gives a retryable error without falsely reporting enrollment.

This is a loopback development preview, not a public acquisition service.
Public hosting, an approved email provider, double opt-in/delivery, abuse protection,
a user-facing removal process and the launch privacy policy are still launch work.
Do not expose the local evidence server publicly. Any future marketing deployment
must isolate the signup service from the application's private session APIs.
The operator can remove a requested email directly from the dedicated database;
never solicit private addresses in public GitHub issues.

## Validation

Meaningful automated coverage checks normalization, malformed/oversized data,
origin/method/content-type guards, duplicate storage, file permissions, and disk
failure behavior. Browser verification uses only synthetic example.com addresses.
Run the normal test, typecheck, lint and build commands.

The desktop/phone visual pass covers 1440 px and 390 px. Runtime screenshots and
synthetic signup databases are temporary artifacts, never committed. See the PR
for actual results and any unresolved limitations.

Verified on 2026-11-12: 63 tests, typecheck, lint and production build passed;
the seeded demo still serves its overview. The built landing routes and static
font/art MIME types were checked. At both 1440 px and 390 px, axe-core's WCAG
A/AA rules reported zero violations, console output was clean, and there was
no horizontal scrolling. Computed styles confirm decorative animation is off
under reduced motion; the cottage was decoded before final visual inspection.
Browser clicks, tab arrow-key navigation and a synthetic local signup were exercised.
The fresh finish review's verdict was Ship, with reduced-motion and contrast
findings resolved. These checks are not a complete accessibility certification.
