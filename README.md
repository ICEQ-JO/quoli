# Quoli

**One visual map of what your coding agents did.**

Coding agents such as Claude Code read files, run commands, edit code, spend tokens and commit to branches. Today that trail is scattered across terminal scrollback, Git diffs, cloud consoles and billing pages. Quoli records it as it happens and draws it on one board. You can see what the agent did, where in the code it happened, which branch and commits it produced, and which services run that code. You can also see what it cost and what deserves a review.

Everything runs locally. Nothing leaves your machine.

## What works today

**Pages**
- **Dashboard:** spend today, this week and this month, plus live sessions, sessions that need a review, recent sessions and projects.
- **Sessions:** every recorded session across projects, with filters (project, agent, status, failures).
- **Usage:** spend over time, by model and by project; how much prompt caching saved; the most expensive sessions; optional daily and monthly budgets.
- **Live sessions:** the Dashboard and the sidebar show what each running agent is doing right now, for how long, and what it has spent (also in the last 10 minutes). Optional local alerts (Settings → Alerts, off by default) tell you when a session passes a cost, the daily budget is reached, a possible loop appears, a session goes quiet or ends, in Quoli and optionally as a system notification.
- **Insights:** is it getting better or worse? Sessions per day, median and 90th-percentile cost per session, failure rate, tool mix, session length and possible loops, by agent and model. Click a day to see its sessions.
- **Projects and Settings:** record every repository with one setup (or connect one), current model prices from models.dev with your own edits on top, data retention and redaction, the theme.

**One board per project, with five lenses on the same selection**

| Lens | Answers |
| --- | --- |
| **Summary** | What was asked, what changed, what ran, where the time and money went (per prompt, and the slowest calls), the MCP servers, skills and subagents it called, possible loops (a command failing again and again, a file edited over and over), what it cost, and a checklist of things worth reviewing. |
| **Agents** | What did the agent do? Every tool call in order, with full commands, results, subagents and failures. There is a step list and a lane graph. |
| **Code** | Where did it happen? A change map: the files the session changed in the middle, the files they import on the left, the files that import them on the right. Click a file for its code and diff. |
| **Git** | Which branch and commits? The local repository's history and branches, marked as pushed or local-only. Commits created during a session are tagged with it. |
| **Infra** | Where does it run? Services declared in the repo's config files (Docker Compose, Vercel, Fly, Railway, Terraform and others), live CPU and memory for local Docker containers, and CI pipelines listed separately. You can also add any hosted service by hand. |

A replay bar steps through any session call by call, and every lens follows along.

**Honest by design:** every fact is marked as recorded, derived or inferred. Unknown values stay empty, and costs are estimates at list prices, not invoices.

**Supported agents:** Claude Code, Codex, OpenCode (version 2) and Pi.

## Try it in two minutes

Requires Node 24 (Node 22.13+ also works) and pnpm.

```sh
pnpm install
pnpm demo                 # synthetic demo project: Claude Code, Codex, OpenCode and Pi sessions
```

Open http://127.0.0.1:4400.

For a bigger example (about 2,400 files, 560+ commits, and a session with 500+ tool calls and subagents), run:

```sh
QUOLI_HOME=/tmp/quoli-demo QUOLI_PORT=4471 pnpm demo -- --large
```

Then open http://127.0.0.1:4471. The demo data is fully synthetic and needs no API keys.

## Install

```sh
npx https://iceq.best/quoli.tgz
```

One command, run inside the project you work on. The first time, it asks whether to record only that project or every project on this computer (`--here` / `--all` answer without asking), offers to link your Quoli account, and starts Quoli in the background, where it starts again by itself at every login (a systemd user service on Linux, a LaunchAgent on macOS, a script in the Startup folder on Windows; `stop` stops it until the next login, `--foreground` runs it in the terminal instead). Open it at [app.iceq.best](https://app.iceq.best): the page reads Quoli on your computer straight from your browser, so nothing is uploaded (your browser may ask to allow that once; `http://127.0.0.1:4400` is the same app without the website). After that the same command just starts Quoli; run inside a project that is not recorded, it offers to add it. Projects → Stop recording leaves a project out again.

You do not need to keep Quoli open: the agents' hooks keep recording with the terminal closed, and a linked account keeps receiving summaries (the agents start a short `quoli sync` that exits by itself). Linking opens your browser to sign in at [iceq.best/app](https://iceq.best/app/) and approve the code it shows; your prompts and code stay on your machine, and only session summaries reach your account. `connect` links (or re-links) an account later; `setup --remove` stops recording and takes Quoli out of every agent. Needs Node.js 22.13 or newer.

`quoli.tgz` is a permanent link: `npx` keeps the first copy it downloads from a link, so on start the package reads the newest version number from `iceq.best/quoli.json` and hands over to `quoli-<version>.tgz` when it is newer (`QUOLI_NO_UPDATE_CHECK=1` turns that off). The package is served from the website for now; it will also be on npm as `@iceq/quoli` (the plain name `quoli` was refused as too close to `quill`). It contains only the built app (`pnpm pack:release` makes it in `release/`; see [docs/architecture.md](docs/architecture.md)). From a clone of this repository, use the `pnpm` commands below instead.

## Use it with your own repositories

```sh
pnpm quoli-setup        # once: records every repository, for each agent found on this machine
pnpm dev                # start Quoli on http://127.0.0.1:4400
cd any/repo && claude   # or codex, opencode, pi: sessions appear live
```

`pnpm quoli-setup` (or **Projects → Record every repository → Set up** in the app) installs Quoli once per agent in that agent's own user-level location:

| Agent | File |
| --- | --- |
| Claude Code | `~/.claude/settings.json` (Quoli's hooks are added; your other settings and hooks are kept) |
| Codex | `~/.codex/hooks.json` (or `$CODEX_HOME`); run `codex` once and approve Quoli's hooks with `/hooks` |
| OpenCode | `~/.config/opencode/plugins/quoli.js` |
| Pi | `~/.pi/agent/extensions/quoli.ts` (or `$PI_CODING_AGENT_DIR`) |

After that, any repository you open with those agents appears under Projects on its first session, named by its GitHub repository when it has one. Sessions run while Quoli is closed are queued in `~/.quoli/spool.jsonl` and recorded when Quoli next starts. `pnpm quoli-setup codex pi` sets up only the agents named; `pnpm quoli-setup --remove` takes all of it out again. A plugin or extension file Quoli did not write is never touched.

### Connecting one repository instead

```sh
pnpm connect /path/to/your/repo   # adds Quoli's hooks to <repo>/.claude/settings.local.json
```

For Codex, run `pnpm connect /path/to/your/repo --agent codex`, then start `codex` in the repo and approve Quoli's hooks with `/hooks` (Codex runs project hooks only once you trust them). The hook file, `.codex/hooks.json`, is kept out of Git. Hosted tools such as Codex's web search don't fire hooks, so they don't appear.

For OpenCode, run `pnpm connect /path/to/your/repo --agent opencode`. That installs a small plugin as `.opencode/plugins/quoli.js` (kept out of Git), which OpenCode loads the next time it starts in that repo.

For Pi, run `pnpm connect /path/to/your/repo --agent pi`. That installs a small extension as `.pi/extensions/quoli.ts` (kept out of Git), which Pi loads the next time it starts in that repo.

You can also connect a repository from **Projects → Connect** in the app and choose the agents there. `pnpm connect /path/to/your/repo --remove` (with `--agent codex`, `opencode` or `pi`) removes them again.

Press `?` in the app for all keyboard shortcuts. The main ones:
- `1`–`5` switch lenses;
- `Ctrl/⌘ K` searches files, tool calls, sessions and pages;
- `Esc` clears the selection;
- `←`/`→` on the replay bar step through a session.

## Classes

Sign in with GitHub at [iceq.best/app](https://iceq.best/app/) to create or join a team (a class, a company, a group of friends). Members opt in from Settings → Team sync, and only session summaries are shared (never prompts or code); the team owner sees how the team uses coding agents. Setup: [docs/teams.md](docs/teams.md).

## Privacy

- All data stays on your machine, in `~/.quoli` (override with `QUOLI_HOME`). The server listens only on `127.0.0.1`.
- Prompts and tool input and output are stored locally so you can read them. Common credential formats are redacted before anything is stored.
- Quoli observes passively: it never blocks, steers or replays the agent.
- The only outbound request is a once-a-day GET of the public model price list at models.dev, which sends nothing about you. Turn it off in Settings → Prices.

## Landing page

The public website lives in `web/landing/` and `web/src/landing/`, separate from the app. It is an animated pixel page with an interactive, synthetic product example, plus Mission, Roadmap and Privacy pages and a waitlist form.

To preview it locally:

```sh
QUOLI_HOME=/tmp/quoli-landing-preview QUOLI_PORT=4473 pnpm landing
```

Then open http://127.0.0.1:4473/landing/.

### Deploying it to Vercel

`vercel.json` is ready. Import the repository in Vercel and deploy. The build (`QUOLI_BUILD=landing pnpm build`) publishes **only** the landing page; the local app is never deployed. `/` redirects to `/landing/`.

The waitlist form posts to a Vercel Function, `api/waitlist.ts`, which stores email addresses in Redis. To turn it on:
1. In the Vercel project, open **Storage** (Marketplace) and add **Upstash for Redis**, connected to the project. It provides `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. Redeploy.

Until a database is connected, the form says "The waitlist isn't open yet", and it never claims to have saved an address. Signups live in the Redis hash `quoli:waitlist` (email → joined time). You can read them in the Upstash console.

Optional settings (Vercel → Settings → Environment Variables, then redeploy):

| Variable | What it does |
| --- | --- |
| `VITE_PUBLIC_CONTACT_EMAIL` | The address behind "Get in touch" in the Collaborate section and the footer's Contact link. Without it, the button points to the waitlist. |
| `VITE_PUBLIC_SITE_URL` | Your site's address, for example `https://quoli.dev`, used for link previews. On Vercel the production domain is picked up automatically, so this is only needed elsewhere. |
| `VITE_PUBLIC_REPO_URL` | Shows the Docs and GitHub links. The repository is private for now, so leave it unset until it is public. |

To use your own domain, add it under the Vercel project's **Settings → Domains** and follow the DNS instructions there; the redirect from `/` to `/landing/` works on any domain.

See [docs/landing.md](docs/landing.md) for the design, motion and launch notes.

## Development

```sh
pnpm dev          # server + UI with hot reload
pnpm test         # unit and API tests
pnpm typecheck
pnpm lint
pnpm build        # app + landing
```

## Documentation

- [Product vision and roadmap](docs/vision.md)
- [Architecture, decisions and limitations](docs/architecture.md)
- [HTTP API](docs/api.md)
- [App design system](DESIGN.md) and [landing design system](docs/landing-design.md)
- [Working agreements for contributors and agents](AGENTS.md)

## Status

Quoli is an early-stage project, built in the open. Phase 1 (the MVP) is largely built, and phase 3 now records Codex, OpenCode and Pi alongside Claude Code. Next on the roadmap:
- **Deeper observability:** per-step cost and time, failures and loops, cross-session trends, live alerts;
- **Later phases:** symbol-level code maps, live hosting-provider data, and opt-in team sharing.
