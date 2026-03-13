# verbum

Everything is a conversation.

`verbum-ai` is a TypeScript framework for building agentic systems around messages instead of ad-hoc tool glue. Actors receive messages, return messages, and the Router records the whole conversation graph.

## Install

```bash
npm install verbum-ai
```

## Quick start

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

      return "The suite passed. Time to ship.";
    })
  })
);

router.register(new ProcessActor({ id: "shell" }));
router.register(new MemoryActor({ id: "memory" }));

await router.send({
  from: "user",
  to: "claude",
  role: "user",
  conversationId: "launch-demo",
  content: { type: "text", text: "Check the build and tell me if we can launch." }
});
```

## Included primitives

- `Router`: recursive dispatch, conversation storage, graph visualization data
- `ModelActor`: pluggable adapter-based model actor
- `ProcessActor`: persistent shell-backed actor
- `MemoryActor`: conversational memory search and storage
- `ToolActor`: deterministic functions as conversational participants
- `HumanActor`: send messages to a real person or transport

## Notes

- The package is intentionally dependency-light.
- Provider SDK integrations can be layered in through `ModelActor` adapters.
- Collaboration and P2P are not part of the current package scope.
