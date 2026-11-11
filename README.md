# Quoli

**See everything your coding agent did — on one map.**

Every tool call, every token, every file it read or changed, the branch it worked on, and the services that code runs in. One board, four lenses, one shared selection, and a timeline to replay the session.

| Lens | Answers |
| --- | --- |
| **Agents** | What did it do? Swimlanes for the agent and its subagents, every tool call in order, failures in red, tokens per lane. |
| **Code** | Where did it happen? Your repo as a map; edited files glow orange, read files outlined blue. Click for the exact diff. |
| **Git** | Which branch? Branches, recent commits, uncommitted changes, and the sessions that ran on each branch. |
| **Infra** | Where does it run? Services read from your compose, Dockerfiles, Vercel/Fly/Railway/Terraform/CI config, with the ones the agent touched highlighted. |

## Quick start

Requires Node 24 and pnpm 11.

```sh
pnpm install
pnpm demo
```

Open http://127.0.0.1:4400. The demo builds a sample project with three recorded sessions.

## Use it with your own repo

```sh
pnpm connect /path/to/your/repo   # adds hooks to <repo>/.claude/settings.local.json
pnpm dev                          # start Quoli
cd /path/to/your/repo && claude   # sessions appear live
```

`pnpm connect /path/to/your/repo --remove` takes the hooks out again. `pnpm start` runs a production build.

## Keys

`1`–`4` switch lenses · `⌘K` search everything · `Esc` clear selection · `←`/`→` on the timeline step through the session.

## Privacy

Everything stays on your machine (`~/.quoli`, override with `QUOLI_HOME`). The server only listens on `127.0.0.1`. Prompts and tool input/output are stored locally so you can read them; common credential formats are redacted first.

## Docs

- [Product vision](docs/vision.md) — the idea, the visual language, the roadmap
- [MVP plan](docs/mvp.md) — what we are building next, as issue-ready increments
- [Architecture](docs/architecture.md) — how it works, decisions, limitations
- [Working agreements](AGENTS.md)

## Development

```sh
pnpm dev        # server + UI with hot reload
pnpm test       # unit tests
pnpm typecheck
pnpm lint
```
