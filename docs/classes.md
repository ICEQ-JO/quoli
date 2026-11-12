# Quoli Classes: running the hosted class view

Quoli Classes (#144) lets an instructor see how a class uses coding agents. Students run Quoli on their own machines and choose to share a **summary** of each session; prompts, code, commands, tool output, file names and folder paths never leave their machines (allow-list: `toUpload` in `server/sync.ts`).

## Pieces

| Piece | Where | Notes |
| --- | --- | --- |
| Database, sign-in, access rules | Supabase (`supabase/migrations`) | Row-level security; uploads through `submit_summaries` with a student's sync key. No service key is used anywhere. |
| Class page | `web/class` + `web/src/class`, built with the landing page and served at `/class/` on Vercel | Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time. |
| Uploader | `server/sync.ts` in each student's Quoli | Off by default; Settings → Class sync. Reads `QUOLI_SYNC_URL` and `QUOLI_SYNC_ANON_KEY`, which the published package will carry as defaults. |

## One-time setup (owner)

1. **Supabase project** (free tier): create it, then copy the Project URL and the publishable/anon key from **Connect** or **Project Settings → API Keys**. The secret/service-role key is not needed; never put it in the page, the package or a prompt.
2. **GitHub sign-in**: GitHub → Settings → Developer settings → OAuth Apps → New. Homepage `https://iceq.best`, callback `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the Client ID and Secret into Supabase → Authentication → Providers → GitHub (free).
3. **Redirects**: Supabase → Authentication → URL Configuration: Site URL `https://iceq.best/class/`, and add `https://iceq.best/class/` to Redirect URLs.
4. **Schema**: `supabase link --project-ref <ref>` then `supabase db push` applies `supabase/migrations`.
5. **Vercel**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project's environment variables and redeploy. The page is then at `https://iceq.best/class/`.

## Using it

- **Instructor**: sign in at `/class/`, create a class, share the invite code.
- **Student**: install Quoli (`pnpm quoli-setup` once), sign in at `/class/`, join with the code, create a sync key, paste it in Quoli → Settings → Class sync and turn sharing on. Only sessions that start after that are shared; a student can leave the class, revoke keys or delete what they shared at any time.
- The instructor sees, per student, sessions, last activity, calls, failures, possible loops and estimated spend, for sessions since the student joined; plus the most recent sessions with agent, model, GitHub repository and branch.

## Local development

`supabase start` runs the stack in Docker; `supabase test db` runs the access-rule tests in `supabase/tests`. Build the page against it with `QUOLI_BUILD=landing VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<local anon key> pnpm build`, and point a local Quoli at it with `QUOLI_SYNC_URL` and `QUOLI_SYNC_ANON_KEY`.

## Limits

- Free tiers: Supabase pauses a free project after a week without activity (data kept), 500 MB database (summaries are a few KB each). Vercel Hobby is for non-commercial use; charging customers needs Vercel Pro.
- Costs are list-price estimates from each student's Quoli; sessions with unpriced models show as `+` or `—`.
- Students who sign in but never turn on sync appear with no sessions.
