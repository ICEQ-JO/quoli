# Landing page — Phase 1

Issue [#107](https://github.com/ICEQ-JO/quoli/issues/107), PR [#111](https://github.com/ICEQ-JO/quoli/pull/111).

## Direction

The owner rejected the first city/robot/cottage design on 2026-11-12 and requested
a complete rebuild following the reference site's actual structure, pixel material and
substantive animation. The rejected assets, components and comps have been removed.
The original Quoli content and code now follow the reference's compact twin hero
panels, dotted white ground, green mechanical-demo chapter, blue product chapter,
large mission link and multi-column footer.

The reference site is a structural/material reference, not source code or artwork to copy.
Quoli's forest, contour fields, recorder and signal motion are original code.
The hero uses Jost sans like the reference; section headings use Jersey 10 pixel
lettering. Both are self-hosted under their included OFL licenses.

## Run and entries

    QUOLI_HOME=/tmp/quoli-landing-preview pnpm landing

Open http://127.0.0.1:4420/landing/. Override QUOLI_PORT when needed.
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
offscreen, and all stop in hidden tabs. The page pause control reaches every canvas
and CSS animation; replay restarts the demonstration. Reduced motion draws a
readable final recorder state and stops continuous updates. Terminal and product
data are synthetic and labeled. The product board supports tab arrows/Home/End,
explicit row selection, and a compact readable phone layout.

## Waitlist and launch limits

The tested POST /api/waitlist handler is unchanged. It accepts an email JSON field,
checks same-origin Origin and content type, bounds requests to 2 KB, validates and
normalizes email, and deduplicates into QUOLI_HOME/waitlist.sqlite with owner-only
file permissions. It stores email/joined timestamp, separate from agent evidence.
The form reports success only after storage, or a retryable error.

No automatic email, analytics, or third-party signup provider is connected. This
is a loopback preview. Public marketing hosting, a separate signup backend, email
provider/opt-in delivery, abuse controls, a removal flow and launch privacy policy
are still launch work. Never expose the private evidence server publicly.
