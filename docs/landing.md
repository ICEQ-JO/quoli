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

## Waitlist

Two handlers share one validator (`shared/waitlist.ts`). Both accept a JSON `email`, require a same-origin Origin and a JSON content type, cap requests at 2 KB, and normalise the address before storing it.

- **Local preview** (`pnpm landing`): `POST /api/waitlist` in `server/waitlist.ts` stores email and joined time in `QUOLI_HOME/waitlist.sqlite`. That file has owner-only permissions and is kept apart from agent evidence.
- **Vercel** (`api/waitlist.ts`, a Vercel Function): writes `HSETNX quoli:waitlist <email> <joined>` through the Upstash REST API. It uses `KV_REST_API_URL`/`KV_REST_API_TOKEN` from the Vercel Marketplace Upstash integration, or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`. Without them it answers 503 "isn't open yet". It never fakes success.

The form reports success only after the address is stored; otherwise it shows a retryable error.

## Deploying (Vercel)

- `vercel.json` builds with `QUOLI_BUILD=landing pnpm build`, which uses only the landing entry, serves `dist/` and redirects `/` to `/landing/`. The local app and the evidence server are never deployed.
- No analytics are included, and no automatic email is sent.

Before sending launch updates, the operator still needs to:
- publish a contact address for removal requests;
- connect an email provider with an unsubscribe link in every message.

- Repository links (Docs, GitHub, Development) appear only when `VITE_PUBLIC_REPO_URL` is set at build time. While the repository is private they are hidden, so visitors never land on a GitHub 404.

Never expose the private evidence server publicly.
