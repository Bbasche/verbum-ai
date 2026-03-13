export const launchSurfaces = [
  {
    title: "Publishable npm package",
    copy:
      "A dependency-light TypeScript framework with the Router, Actors, Memory, Process orchestration, and tests already wired."
  },
  {
    title: "Vercel-ready launch site",
    copy:
      "A static marketing and docs site in Next.js keeps the story sharp without acting like a client itself."
  },
  {
    title: "Mac app story that lands",
    copy:
      "The site explains the graph, inbox, search, and message bus while the Mac app carries every live integration."
  },
  {
    title: "Launch collateral",
    copy:
      "README, CONTRIBUTING, CI, release automation, demo script, launch checklist, and a clear now-versus-next roadmap."
  }
] as const;

export const actorCards = [
  {
    name: "ModelActor",
    accent: "amber",
    copy: "Wrap Claude, GPT, Gemini, or your own adapter and keep everything in one message format."
  },
  {
    name: "ProcessActor",
    accent: "slate",
    copy: "Persistent shell sessions become first-class conversational participants with stateful command execution."
  },
  {
    name: "MemoryActor",
    accent: "gold",
    copy: "Recall facts, notes, and previous runs through conversational search instead of bespoke retrieval glue."
  },
  {
    name: "ToolActor",
    accent: "ember",
    copy: "Deterministic functions can answer messages directly or be composed into larger flows."
  },
  {
    name: "HumanActor",
    accent: "chalk",
    copy: "Humans stay inside the graph instead of being pushed into side channels or callbacks."
  }
] as const;

export const messageBusLanes = [
  {
    label: "Claude Code",
    items: ["prompt", "tool call", "edit patch", "commit summary"]
  },
  {
    label: "Codex",
    items: ["task", "search", "tests", "final answer"]
  },
  {
    label: "Terminals",
    items: ["zsh", "python", "postgres", "tail -f"]
  },
  {
    label: "Inbox",
    items: ["human reply", "@claude", "@codex", "#memory"]
  }
] as const;

export const searchDocuments = [
  {
    id: "app-bridges",
    title: "App Bridges",
    kind: "Integration",
    tags: ["claude code", "codex", "terminal", "bridge", "graph"],
    excerpt:
      "Verbum App watches Claude Code sessions, runs Codex as a managed subprocess, and ingests PTY terminals so every source shows up in one live graph."
  },
  {
    id: "chat-bridge",
    title: "Chat Bridge",
    kind: "Protocol",
    tags: ["websocket", "chat", "inbox", "routing"],
    excerpt:
      "Any frontend can connect over a single WebSocket, send messages to an actor, and subscribe to graph events without learning provider-specific APIs."
  },
  {
    id: "router-core",
    title: "Router Core",
    kind: "Framework",
    tags: ["router", "actor", "message", "conversation"],
    excerpt:
      "The Router records every message, resolves targets, dispatches to actors, and can visualize the resulting conversation graph for replay and debugging."
  },
  {
    id: "launch-story",
    title: "Launch Story",
    kind: "Narrative",
    tags: ["demo", "announcement", "hn", "viral", "mac app"],
    excerpt:
      "Lead with the god-view: Claude Code, Codex, and live terminals all talking in one scene, then show search and inbox to make the orchestration feel inevitable."
  },
  {
    id: "message-bus",
    title: "Message Bus",
    kind: "UI",
    tags: ["bus", "homescreen", "stream", "latency", "status"],
    excerpt:
      "The home screen message bus is a living status board for flows, token rates, queue pressure, retries, and human interrupts."
  },
  {
    id: "roadmap",
    title: "Now vs Next",
    kind: "Roadmap",
    tags: ["p2p", "collaboration", "next", "launch"],
    excerpt:
      "This launch ships the local single-machine orchestration story first. Collaboration and P2P mesh stay clearly marked as the next chapter."
  }
] as const;

export const graphNodes = [
  {
    id: "verbum-app",
    label: "Verbum App",
    type: "router",
    x: 50,
    y: 44,
    z: 36,
    detail:
      "The command center. It watches sessions, routes inbox messages, powers search, and renders the live graph."
  },
  {
    id: "claude-code",
    label: "Claude Code",
    type: "model",
    x: 24,
    y: 24,
    z: 18,
    detail: "Observed through the SDK or session files. Tool calls and edits fan out as visible edges."
  },
  {
    id: "codex",
    label: "Codex",
    type: "model",
    x: 78,
    y: 28,
    z: 26,
    detail: "Runs as a managed subprocess so the graph captures search, code actions, and final answers."
  },
  {
    id: "shell-alpha",
    label: "zsh: repo",
    type: "process",
    x: 18,
    y: 68,
    z: 10,
    detail: "A persistent terminal session for git, npm, and build loops."
  },
  {
    id: "shell-beta",
    label: "python: data",
    type: "process",
    x: 74,
    y: 70,
    z: 14,
    detail: "A second terminal surface proves Verbum is coordinating the whole machine, not one shell."
  },
  {
    id: "search",
    label: "Search",
    type: "memory",
    x: 52,
    y: 16,
    z: 16,
    detail: "Fast local retrieval over docs, sessions, and launch assets with conversational follow-ups."
  },
  {
    id: "inbox",
    label: "Inbox",
    type: "human",
    x: 48,
    y: 82,
    z: 12,
    detail: "Every human interruption arrives in one place with actor routing preserved."
  }
] as const;

export const graphEdges = [
  { from: "claude-code", to: "verbum-app", label: "tool calls + patches" },
  { from: "codex", to: "verbum-app", label: "json stdout stream" },
  { from: "verbum-app", to: "shell-alpha", label: "dispatch command" },
  { from: "verbum-app", to: "shell-beta", label: "dispatch command" },
  { from: "search", to: "verbum-app", label: "retrieval result" },
  { from: "inbox", to: "verbum-app", label: "human override" },
  { from: "verbum-app", to: "inbox", label: "summary + reply" }
] as const;

export const inboxTranscript = [
  {
    speaker: "Founder",
    route: "@claude-code",
    text: "Refactor the build error, but ask Codex to explain the root cause before you patch."
  },
  {
    speaker: "Verbum App",
    route: "system",
    text: "Claude Code is editing `router.ts`. Codex is validating the failure in a second terminal. Search found a related fix from yesterday."
  },
  {
    speaker: "Founder",
    route: "#memory",
    text: "Pin that pattern as our launch demo setup."
  }
] as const;

export const quickstartCode = `import {
  Router,
  ModelActor,
  ProcessActor,
  MemoryActor,
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
router.register(new MemoryActor({ id: "memory" }));`;

export const docSections = [
  {
    title: "What ships this weekend",
    body:
      "Local orchestration, the publishable core package, the launch website, the native app, docs, CI, release automation, and the demo story."
  },
  {
    title: "What stays next",
    body:
      "Collaboration, remote mesh/P2P, and federated sessions stay explicitly in the roadmap so the launch story is ambitious without hand-waving."
  },
  {
    title: "Why this lands",
    body:
      "It reframes agent systems around the message itself. That makes the graph, replay, inbox, and routing story instantly legible to developers."
  }
] as const;

export const launchChecklist = [
  "Point the Vercel project at `apps/web` and deploy.",
  "Publish `verbum-ai` with `npm publish --workspace packages/verbum --access public`.",
  "Push to GitHub and wire `NPM_TOKEN` for release automation.",
  "Record the 60-second demo with the Verbum App graph, Claude Code, Codex, and two live terminals.",
  "Post the announcement tweet, then immediately submit the Show HN with the replay clip and docs link."
] as const;
