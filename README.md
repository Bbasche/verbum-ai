# Verbum

Everything is a conversation.

Verbum is an open-source TypeScript framework and native macOS command center for systems built out of models, terminals, tools, memory, and humans. Instead of hiding orchestration behind callbacks and logs, Verbum turns every interesting interaction into a message you can route, replay, inspect, and eventually search.

## What is in this repo

- `packages/verbum`: the publishable npm package with the Router, built-in actors, message helpers, and tests
- `apps/web`: the static marketing/docs site for Vercel
- `apps/mac`: the native Electron-based macOS app with the graph, inbox, terminal, and search surfaces
- `docs`: launch collateral, demo script, and announcement drafts

## Quick start

```bash
npm install
npm run build
npm test
```

Run the docs/marketing site:

```bash
npm run dev --workspace @verbum/web
```

Run the native app:

```bash
npm run dev --workspace @verbum/mac
```

The Mac app is the live Verbum client. The docs site is static.

It can:

- watch Claude task files in `~/.claude/tasks`
- send one-off prompts to `claude`
- send one-off prompts to `codex exec --json`
- run terminal commands in tracked sessions
- render custom JSONL sources defined in `verbum.app.config.json`

Build the publishable package:

```bash
npm run build --workspace verbum
```

## Why Verbum

- Models, terminals, tools, and humans all implement the same conversational contract.
- The Router records every hop, so observability is built into the abstraction instead of bolted on later.
- The native app shows Claude Code, Codex, search, inbox, and terminals in one command-center view.
- The launch story is intentionally focused on local orchestration first. Collaboration and P2P stay on the roadmap.

## Launch surfaces

- Docs site: static, clean, and ready for Vercel
- Native app: live desktop shell for the graph/search/inbox story
- npm package: lightweight framework package ready for publishing
- Launch docs: demo script, launch checklist, and post drafts

## Publish checklist

1. Create the GitHub repo and push this monorepo.
2. Point Vercel at `apps/web`.
3. Publish `verbum` to npm.
4. Wire `NPM_TOKEN` in GitHub Actions for release automation.
5. Record the demo in the native app and post the launch assets from `docs/`.

## License

[MIT](/Users/benbasche/Desktop/verbum/LICENSE)
