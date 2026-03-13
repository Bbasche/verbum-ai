export const graphNodes = [
  {
    id: "verbum-app",
    label: "Verbum App",
    type: "router",
    x: 50,
    y: 48,
    z: 40,
    detail:
      "The observatory. It watches streams, powers search, and keeps the whole machine legible."
  },
  {
    id: "claude-code",
    label: "Claude Code",
    type: "model",
    x: 24,
    y: 24,
    z: 18,
    detail: "Observed through the SDK or session files with tool calls rendered as child edges."
  },
  {
    id: "codex",
    label: "Codex",
    type: "model",
    x: 76,
    y: 24,
    z: 24,
    detail: "Managed subprocess mode for search, shell work, and final synthesis."
  },
  {
    id: "shell-1",
    label: "zsh · repo",
    type: "terminal",
    x: 26,
    y: 76,
    z: 14,
    detail: "Local shell state persists across commands so repo work reads like a conversation."
  },
  {
    id: "shell-2",
    label: "zsh · machine",
    type: "terminal",
    x: 74,
    y: 76,
    z: 10,
    detail: "Second terminal proves Verbum is orchestrating the machine, not a single pane."
  },
  {
    id: "search",
    label: "Search",
    type: "memory",
    x: 50,
    y: 12,
    z: 16,
    detail: "Fast local conversational retrieval over docs, notes, and live session traces."
  },
  {
    id: "inbox",
    label: "Inbox",
    type: "human",
    x: 50,
    y: 88,
    z: 12,
    detail: "Every human interrupt lands here with actor routing preserved."
  },
  {
    id: "custom-source",
    label: "Custom Source",
    type: "custom",
    x: 13,
    y: 50,
    z: 10,
    detail: "Your own typed message adapter can appear in the same graph and thread."
  }
] as const;

export const graphEdges = [
  { from: "claude-code", to: "verbum-app", label: "patch stream" },
  { from: "codex", to: "verbum-app", label: "json events" },
  { from: "verbum-app", to: "shell-1", label: "dispatch" },
  { from: "verbum-app", to: "shell-2", label: "dispatch" },
  { from: "search", to: "verbum-app", label: "citation hit" },
  { from: "inbox", to: "verbum-app", label: "human override" },
  { from: "verbum-app", to: "inbox", label: "reply" },
  { from: "custom-source", to: "verbum-app", label: "typed adapter" }
] as const;

export const inboxThread = [
  {
    author: "Founder",
    route: "@claude-code",
    text: "Refactor the bug, but have Codex explain the failure before you merge anything."
  },
  {
    author: "Verbum App",
    route: "system",
    text: "Codex is verifying the issue in a second terminal. Claude Code is holding the patch until search and tests agree."
  },
  {
    author: "Founder",
    route: "#memory",
    text: "Save this whole pattern as the demo story."
  }
] as const;

export const searchDocuments = [
  {
    id: "orchestration",
    title: "Orchestration Layer",
    kind: "Architecture",
    tags: ["claude code", "codex", "terminals", "orchestration"],
    excerpt:
      "Verbum App sits above Claude Code, Codex, and PTY terminals. It does not replace them. It makes them visible in one command center."
  },
  {
    id: "graph",
    title: "3D Conversation Graph",
    kind: "Surface",
    tags: ["graph", "nodes", "edges", "replay"],
    excerpt:
      "Every session becomes a node. Every message becomes an edge. Activity pulses through the graph so debugging feels immediate."
  },
  {
    id: "search",
    title: "Conversational Search",
    kind: "Feature",
    tags: ["search", "citations", "local", "fast"],
    excerpt:
      "Search is local-first and instant. It answers from docs, message traces, and launch assets so the app becomes the front door to project memory."
  },
  {
    id: "launch",
    title: "Launch Story",
    kind: "Narrative",
    tags: ["tweet", "hn", "demo", "mac app"],
    excerpt:
      "Lead with the god-view: Claude Code and Codex solving a real task while the app shows the whole machine talking to itself."
  },
  {
    id: "roadmap",
    title: "Now vs Next",
    kind: "Roadmap",
    tags: ["p2p", "collaboration", "roadmap"],
    excerpt:
      "This launch focuses on single-machine orchestration. Collaboration and P2P stay clearly marked as the next layer."
  }
] as const;

export const onboardingSteps = [
  "Open Verbum and connect Claude Code with one connector.",
  "Add Codex as a companion source or run it from inside the app.",
  "Watch terminals, code blocks, and tool calls render in one thread.",
  "Add your own source with the typed message contract when you outgrow the defaults."
] as const;
