# Verbum

Everything is a conversation.

Verbum is an open-source TypeScript framework and native macOS app for orchestrating models, terminals, tools, memory, and humans as one readable message system. The framework gives you a common actor model. The Mac app gives you a live command center for Claude Code, Codex, shell sessions, search, and human interrupts.

## Links

- Site: [verbum-ai.vercel.app](https://verbum-ai.vercel.app)
- Docs: [verbum-ai.vercel.app/docs](https://verbum-ai.vercel.app/docs)
- Framework tarball: [github.com/Bbasche/verbum-ai/releases/latest/download/verbum-ai-0.1.0.tgz](https://github.com/Bbasche/verbum-ai/releases/latest/download/verbum-ai-0.1.0.tgz)
- Mac app DMG: [github.com/Bbasche/verbum-ai/releases/latest/download/Verbum.dmg](https://github.com/Bbasche/verbum-ai/releases/latest/download/Verbum.dmg)
- Mac app setup: [github.com/Bbasche/verbum-ai/blob/main/docs/mac-app-setup.md](https://github.com/Bbasche/verbum-ai/blob/main/docs/mac-app-setup.md)
- Package docs: [github.com/Bbasche/verbum-ai/blob/main/packages/verbum/README.md](https://github.com/Bbasche/verbum-ai/blob/main/packages/verbum/README.md)

## Install The Framework

```bash
npm install https://github.com/Bbasche/verbum-ai/releases/latest/download/verbum-ai-0.1.0.tgz
```

```ts
import {
  MemoryActor,
  ModelActor,
  ProcessActor,
  Router,
  scriptedModel
} from "verbum-ai";

const router = new Router({ maxDepth: 8 });

router.register(
  new ModelActor({
    id: "claude",
    provider: "anthropic",
    model: "claude-sonnet",
    adapter: scriptedModel(({ message }) => {
      if (message.from === "user") {
        return {
          from: "claude",
          to: "shell",
          role: "assistant",
          content: { type: "text", text: "npm test" }
        };
      }

      return "Build is green. Ship it.";
    })
  })
);

router.register(new ProcessActor({ id: "shell" }));
router.register(new MemoryActor({ id: "memory" }));
```

## Run The Mac App

```bash
git clone https://github.com/Bbasche/verbum-ai.git
cd verbum
npm install
npm run dev --workspace @verbum/mac
```

The app can:

- watch Claude task files in `~/.claude/tasks`
- send prompts to `claude`
- send prompts to `codex exec --json`
- run terminal commands in tracked sessions
- render custom typed message streams from JSONL sources

## Local Development

```bash
npm install
npm run build
npm test
```

Useful commands:

- `npm run dev --workspace @verbum/web`
- `npm run dev --workspace @verbum/mac`
- `npm run build --workspace packages/verbum`
- `npm test --workspace packages/verbum`

## License

[MIT](/Users/benbasche/Desktop/verbum/LICENSE)
