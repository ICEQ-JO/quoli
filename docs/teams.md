# Quoli accounts and teams: running the hosted service

Anyone can sign in to Quoli with GitHub at `https://iceq.best/app/` (#144, #151) and create or join a **team**. A class is one kind of team (instructor and students); so is a company or a group of friends. Members run Quoli on their own machines and choose to share a **summary** of each session with their teams; prompts, code, commands, tool output, file names and folder paths never leave their machines (allow-list: `toUpload` in `server/sync.ts`). Paid plans are expected to attach to teams later.

The database keeps the names it was created with: a team is a row in `classes`, joining is `join_class`. They are internal and need no migration.

## Connecting a computer (#154)

`supabase/migrations/20261112200000_connect.sql`: local Quoli makes a random secret and calls `link_start` with its SHA-256; it gets a short code (`ABCD-EFGH`, 32 symbols without look-alikes) and opens the account page with it. The signed-in user sees the same code there and approves it (`link_approve`). Local Quoli polls `link_collect` with the secret every two seconds; once approved it receives a new sync key exactly once and the request is deleted. Requests expire after 10 minutes, at most 1000 can be pending, anonymous callers can only start and collect, and the table is never readable. Each connection is a sync key; a user keeps the 5 most recently used. `my_account` gives the page the number of connections, the last upload and the sessions shared.

Approving shares as you: the page asks to check that the terminal shows the same code and to approve only a `connect` you just ran. As with any device-code sign-in, someone who gets you to approve their code can upload summaries into your account (not read anything).

## Pieces

| Piece | Where | Notes |
| --- | --- | --- |
| Database, sign-in, access rules | Supabase (`supabase/migrations`) | Row-level security; uploads through `submit_summaries` with a member's sync key. No service key is used anywhere. |
| Account page | `web/app` + `web/src/class`, built with the landing page and served at `/app/` on Vercel; `/class` redirects there (`vercel.json`) | Uses the URL and publishable key in `shared/hosted.ts`; `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` override them at build time (local development). |
| Connect | `server/link.ts` (`quoli connect`, `POST /api/sync/connect`) | Starts, opens and collects a link; saves the key and turns Team sync on. |
| Uploader | `server/sync.ts` in each member's Quoli | Off by default; Settings → Team sync. Uses `shared/hosted.ts`; `QUOLI_SYNC_URL` and `QUOLI_SYNC_ANON_KEY` override it. |

## One-time setup (owner)

1. **Supabase project** (free tier): create it, then copy the Project URL and the publishable key from **Connect** or **Project Settings → API Keys** into `shared/hosted.ts`. The secret/service-role key is not needed; never put it in the page, the package or a prompt.
2. **Sign-in**: GitHub (below) and email (#156): the page sends a sign-in link with `signInWithOtp`; no password. Supabase's built-in sender only reaches members of the Supabase organization, 2 emails an hour, so email needs custom SMTP: Resend (free: 100 a day, 3,000 a month) with `iceq.best` verified (DKIM `resend._domainkey`, SPF CNAMEs `send` and `rsend`, DMARC `_dmarc`, in Spaceship's DNS), then Supabase → Authentication → Emails → SMTP: host `smtp.resend.com`, port 465, user `resend`, password a Resend API key, sender `login@iceq.best`; and Authentication → Rate Limits → emails per hour about 100. Google is optional (Providers → Google with a Google Cloud OAuth client); its button appears once it is on.
   **GitHub**: GitHub → Settings → Developer settings → OAuth Apps → New. Homepage `https://iceq.best`, callback `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the Client ID and Secret into Supabase → Authentication → Providers → GitHub (free).
3. **Redirects**: Supabase → Authentication → URL Configuration: Site URL `https://iceq.best/app/`, and add `https://iceq.best/app/` to Redirect URLs.
4. **Schema**: `supabase link --project-ref <ref>` then `supabase db push` applies `supabase/migrations`.
5. **Vercel**: no environment variables are needed. Redeploy; the page is at `https://iceq.best/app/`.

## Using it

- **Team owner** (an instructor, a lead): sign in at `/app/`, create a team, share the invite code.
- **Everyone**: sign in at `/app/`; the page shows one command, `npx https://iceq.best/quoli-<version>.tgz connect`. It records every repository for the agents, opens the browser on `/app/?connect=CODE`, and once the signed-in user approves that code it collects a sync key, turns Team sync on and starts Quoli (#154). Settings → Team sync → Connect does the same from a running Quoli. Pasting a sync key made under "Sync keys and shared data" still works.
- **Member**: join with the code. Only sessions that start after that are shared; a member can leave a team, revoke keys or delete what they shared at any time.
- The owner sees, per member, sessions, last activity, calls, failures, possible loops and estimated spend, for sessions since the member joined; plus the most recent sessions with agent, model, GitHub repository and branch.

## Local development

`supabase start` runs the stack in Docker; `supabase test db` runs the access-rule tests in `supabase/tests`. Build the page against it with `QUOLI_BUILD=landing VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<local anon key> pnpm build`, and point a local Quoli at it with `QUOLI_SYNC_URL` and `QUOLI_SYNC_ANON_KEY`.

## Limits

- Free tiers: Supabase pauses a free project after a week without activity (data kept), 500 MB database (summaries are a few KB each). Vercel Hobby is for non-commercial use; charging customers needs Vercel Pro.
- Costs are list-price estimates from each member's Quoli; sessions with unpriced models show as `+` or `—`.
- Members who sign in but never turn on sync appear with no sessions.
- A sync key sends to every team the member is in; there is no per-team choice yet.
- Reconnecting the same computer adds a connection; the page counts connections, not machines.
- Owners see a member by GitHub login, else name, else email address (email-only sign-in), and only for teams the member joined.
