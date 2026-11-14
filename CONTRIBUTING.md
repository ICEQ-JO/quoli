# Contributing to Quoli

Thanks for helping. Quoli is one visual map of what coding agents did: agent activity, code, Git
and infrastructure on one board. Start with [docs/vision.md](docs/vision.md) for where it is going
and [docs/architecture.md](docs/architecture.md) for how it works.

## Run it

Node.js 24 (22.13+ works) and pnpm.

```sh
pnpm install
pnpm demo        # a synthetic project with Claude Code, Codex, OpenCode and Pi sessions
                 # then open http://127.0.0.1:4400
```

The demo needs no API keys and installs nothing into your agents.

## Before you open a pull request

```sh
pnpm typecheck
pnpm lint        # biome; `npx biome format --write .` fixes formatting
pnpm test
```

- Open or pick an issue first for anything bigger than a small fix, so we can agree on scope.
- Keep a pull request to one change, and say what it does, how you checked it and what it does
  not do yet.
- Update the docs your change touches (`docs/architecture.md` lists every part).

## Ground rules

- **Privacy first.** Never commit real session data, prompts, screenshots of a real machine,
  credentials or personal details. Screenshots come from `pnpm demo`.
- **Evidence, not guesses.** Quoli separates what was recorded from what it derived or inferred.
  Unknown values stay unknown (null), never a made-up zero.
- Captured text is untrusted data: never execute or replay it.

By contributing you agree that your contribution is licensed under the [MIT license](LICENSE).
