# Quoli accounts and teams: running the hosted service

Anyone can sign in to Quoli with GitHub at `https://iceq.best/app/` (#144, #151) and create or join a **team**. A class is one kind of team (instructor and students); so is a company or a group of friends. Members run Quoli on their own machines and choose to share a **summary** of each session with their teams; prompts, code, commands, tool output, file names and folder paths never leave their machines (allow-list: `toUpload` in `server/sync.ts`). Paid plans are expected to attach to teams later.

The database keeps the names it was created with: a team is a row in `classes`, joining is `join_class`. They are internal and need no migration.

## Pieces

| Piece | Where | Notes |
| --- | --- | --- |
| Database, sign-in, access rules | Supabase (`supabase/migrations`) | Row-level security; uploads through `submit_summaries` with a member's sync key. No service key is used anywhere. |
| Account page | `web/app` + `web/src/class`, built with the landing page and served at `/app/` on Vercel; `/class` redirects there (`vercel.json`) | Uses the URL and publishable key in `shared/hosted.ts`; `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` override them at build time (local development). |
| Uploader | `server/sync.ts` in each member's Quoli | Off by default; Settings → Team sync. Uses `shared/hosted.ts`; `QUOLI_SYNC_URL` and `QUOLI_SYNC_ANON_KEY` override it. |

## One-time setup (owner)

1. **Supabase project** (free tier): create it, then copy the Project URL and the publishable key from **Connect** or **Project Settings → API Keys** into `shared/hosted.ts`. The secret/service-role key is not needed; never put it in the page, the package or a prompt.
2. **GitHub sign-in**: GitHub → Settings → Developer settings → OAuth Apps → New. Homepage `https://iceq.best`, callback `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the Client ID and Secret into Supabase → Authentication → Providers → GitHub (free).
3. **Redirects**: Supabase → Authentication → URL Configuration: Site URL `https://iceq.best/app/`, and add `https://iceq.best/app/` to Redirect URLs.
4. **Schema**: `supabase link --project-ref <ref>` then `supabase db push` applies `supabase/migrations`.
5. **Vercel**: no environment variables are needed. Redeploy; the page is at `https://iceq.best/app/`.

## Using it

- **Team owner** (an instructor, a lead): sign in at `/app/`, create a team, share the invite code.
- **Member**: install Quoli (`npx https://iceq.best/quoli-<version>.tgz setup` once), sign in at `/app/`, join with the code, create a sync key, paste it in Quoli → Settings → Team sync and turn sharing on. Only sessions that start after that are shared; a member can leave a team, revoke keys or delete what they shared at any time.
- The owner sees, per member, sessions, last activity, calls, failures, possible loops and estimated spend, for sessions since the member joined; plus the most recent sessions with agent, model, GitHub repository and branch.

## Local development

`supabase start` runs the stack in Docker; `supabase test db` runs the access-rule tests in `supabase/tests`. Build the page against it with `QUOLI_BUILD=landing VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<local anon key> pnpm build`, and point a local Quoli at it with `QUOLI_SYNC_URL` and `QUOLI_SYNC_ANON_KEY`.

## Limits

- Free tiers: Supabase pauses a free project after a week without activity (data kept), 500 MB database (summaries are a few KB each). Vercel Hobby is for non-commercial use; charging customers needs Vercel Pro.
- Costs are list-price estimates from each member's Quoli; sessions with unpriced models show as `+` or `—`.
- Members who sign in but never turn on sync appear with no sessions.
- A sync key sends to every team the member is in; there is no per-team choice yet.
