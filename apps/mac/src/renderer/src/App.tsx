import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState
} from "react";

import { graphEdges, graphNodes, searchDocuments } from "./demo-data";
import { MessageRenderer } from "./MessageRenderer";
import type {
  AppMessage,
  BridgeSnapshot,
  ConversationSummary,
  SetupStatus,
  SourceDescriptor
} from "./message-schema";
import verbumMacIcon from "./assets/verbum-mac-icon-1024.png";

type SearchCitation = (typeof searchDocuments)[number];
type AppTab = "chat" | "feed" | "graph";
type GraphFocus = "all" | "selected" | "live";
type ThreadFilter = "all" | "verbum" | "claude-code" | "codex" | "terminal";

const tabCopy: Record<AppTab, { title: string; description: string }> = {
  chat: {
    title: "Conversations across your machine, in one place.",
    description: "Send prompts, review replies, and keep source context close at hand."
  },
  feed: {
    title: "Live activity from every connected source.",
    description: "Follow agent replies, tool output, terminal work, and system events in one stream."
  },
  graph: {
    title: "A visual map of how work is moving.",
    description: "Explore connected sources, inspect relationships, and trace activity through the graph."
  }
};

function scoreDocument(query: string, document: SearchCitation): number {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  const haystack =
    `${document.title} ${document.kind} ${document.tags.join(" ")} ${document.excerpt}`.toLowerCase();
  return terms.reduce((total, term) => total + (haystack.includes(term) ? 2 : 0), 0);
}

function answerQuery(query: string): { summary: string; citations: SearchCitation[] } {
  const citations = [...searchDocuments]
    .map((document) => ({ document, score: scoreDocument(query, document) }))
    .sort((left, right) => right.score - left.score)
    .filter((entry) => entry.score > 0)
    .slice(0, 3)
    .map((entry) => entry.document);

  if (citations.length === 0) {
    return {
      summary:
        "Verbum keeps the machine legible with a focused thread, a global activity feed, and a graph that explains how work is moving.",
      citations: searchDocuments.slice(0, 2)
    };
  }

  return {
    summary: citations.map((citation) => citation.excerpt).join(" "),
    citations
  };
}

function compactPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || path;
}

function titleCase(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function graphCategoryLabel(
  kind: SourceDescriptor["kind"] | (typeof graphNodes)[number]["type"] | undefined
): string {
  switch (kind) {
    case "claude-code":
      return "Claude";
    case "codex":
      return "Codex";
    case "terminal":
      return "Terminal";
    case "human":
      return "Human";
    case "memory":
      return "Search";
    case "custom":
      return "Custom";
    case "router":
      return "App";
    case "model":
      return "Model";
    default:
      return kind ? titleCase(kind) : "Source";
  }
}

function graphNodeLabel(
  nodeId: string,
  source: SourceDescriptor | undefined,
  fallbackType: SourceDescriptor["kind"] | (typeof graphNodes)[number]["type"]
): string {
  if (nodeId === "verbum-app") {
    return "Control room";
  }

  if (nodeId === "shell-1") {
    return "Repo session";
  }

  if (nodeId === "shell-2") {
    return "Machine session";
  }

  if (nodeId === "inbox") {
    return "Human input";
  }

  return graphCategoryLabel(source?.kind ?? fallbackType);
}

function threadFilterLabel(value: ThreadFilter): string {
  switch (value) {
    case "verbum":
      return "Verbum";
    case "claude-code":
      return "Claude";
    case "codex":
      return "Codex";
    case "terminal":
      return "Terminal";
    default:
      return "All";
  }
}

function threadMatchesFilter(
  conversation: ConversationSummary,
  filter: ThreadFilter,
  sourceById: Map<string, SourceDescriptor>,
  threadMessages: AppMessage[]
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "verbum") {
    return conversation.kind === "master" || conversation.kind === "side";
  }

  if (filter === "terminal") {
    return threadMessages.some((message) => message.sourceKind === "terminal");
  }

  const sourceId = conversation.sourceId ?? threadMessages[0]?.sourceId;
  const sourceKind = sourceId ? sourceById.get(sourceId)?.kind : undefined;
  return sourceId === filter || sourceKind === filter;
}

function previewMessage(message: AppMessage | undefined): string {
  if (!message) {
    return "No messages yet";
  }

  const block = message.blocks[0];
  if (!block) {
    return "No content";
  }

  const text =
    block.type === "markdown"
      ? block.text
      : block.type === "code"
        ? `${block.filename ?? block.language} code block`
        : block.type === "command"
          ? `$ ${block.command}`
          : block.type === "tool"
            ? `${block.name} ${block.status}`
            : block.items.map((item: { label: string; value: string }) => `${item.label} ${item.value}`).join(", ");

  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("chat");
  const [selectedId, setSelectedId] = useState("verbum-app");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState("master");
  const [query, setQuery] = useState("How does Verbum orchestrate Claude Code, Codex, and terminals?");
  const [pulseIndex, setPulseIndex] = useState(0);
  const [routeTo, setRouteTo] = useState("claude-code");
  const [graphFocus, setGraphFocus] = useState<GraphFocus>("selected");
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>("all");
  const [composerValue, setComposerValue] = useState(
    "Summarize the latest build result and route the fix to Claude Code."
  );
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupBusy, setSetupBusy] = useState<"package" | "service" | null>(null);
  const [setupNotice, setSetupNotice] = useState<string>("");
  const [searchTurns, setSearchTurns] = useState<
    Array<{ role: "assistant" | "user"; content: string; citations?: SearchCitation[] }>
  >(() => {
    const answer = answerQuery("How does Verbum orchestrate Claude Code, Codex, and terminals?");
    return [{ role: "assistant", content: answer.summary, citations: answer.citations }];
  });

  const deferredQuery = useDeferredValue(query);
  const sources = snapshot?.sources ?? [];
  const conversations = snapshot?.conversations ?? [];
  const allMessages = snapshot?.messages ?? [];
  const busEvents = snapshot?.busEvents ?? ["Verbum App is booting..."];
  const terminals = snapshot?.terminals ?? [];
  const demoCommands = snapshot?.demoCommands ?? [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const terminalById = new Map(terminals.map((terminal) => [terminal.id, terminal]));
  const messageCountBySource = new Map<string, number>();
  const threadCountBySource = new Map<string, Set<string>>();
  const conversationRecencyRank = new Map<string, number>();
  const focusedNodeId = hoveredNodeId ?? selectedId;
  const needsSetup = !setupStatus?.packageInstalled || !setupStatus?.serviceInstalled || !setupStatus?.serviceRunning;

  allMessages.forEach((message, index) => {
    messageCountBySource.set(message.sourceId, (messageCountBySource.get(message.sourceId) ?? 0) + 1);
    const conversationIds = threadCountBySource.get(message.sourceId) ?? new Set<string>();
    conversationIds.add(message.conversationId);
    threadCountBySource.set(message.sourceId, conversationIds);
    if (!conversationRecencyRank.has(message.conversationId)) {
      conversationRecencyRank.set(message.conversationId, index);
    }
  });

  const sortConversations = (items: ConversationSummary[]) =>
    [...items].sort(
      (left, right) =>
        (conversationRecencyRank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (conversationRecencyRank.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0];
  const selectedSource =
    sources.find((source) => source.id === routeTo) ??
    sourceById.get(selectedId) ??
    sources[0] ?? {
      id: "verbum-app",
      name: "Verbum App",
      kind: "custom",
      subtitle: "Unified desktop control room",
      mode: "replacement",
      connected: true,
      typing: "graph, feed, thread routing",
      status: "starting"
    };
  const threadMessages = allMessages.filter(
    (message) => message.conversationId === selectedConversationId
  );
  const messagesByConversation = new Map<string, AppMessage[]>();
  for (const message of allMessages) {
    const bucket = messagesByConversation.get(message.conversationId) ?? [];
    bucket.push(message);
    messagesByConversation.set(message.conversationId, bucket);
  }
  const conversationSections = [
    {
      key: "master",
      label: "Master",
      items: sortConversations(conversations.filter((conversation) => conversation.kind === "master"))
    },
    {
      key: "side",
      label: "Side Threads",
      items: sortConversations(conversations.filter((conversation) => conversation.kind === "side"))
    },
    {
      key: "imported",
      label: "Imported",
      items: sortConversations(conversations.filter((conversation) => conversation.kind === "imported"))
    }
  ].filter((section) => section.items.length > 0);
  const filteredConversationSections = conversationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((conversation) =>
        threadMatchesFilter(
          conversation,
          threadFilter,
          sourceById,
          messagesByConversation.get(conversation.id) ?? []
        )
      )
    }))
    .filter((section) => section.items.length > 0);
  const globalMessages = [...allMessages].reverse();
  const activeEdge = graphEdges[pulseIndex] ?? graphEdges[0];

  const graphDescriptors = graphNodes.map((node) => {
    const source = sourceById.get(node.id);
    const terminal = terminalById.get(node.id);
    const messageCount = messageCountBySource.get(node.id) ?? 0;
    const threadCount = threadCountBySource.get(node.id)?.size ?? 0;
    const inbound = graphEdges.filter((edge) => edge.to === node.id).length;
    const outbound = graphEdges.filter((edge) => edge.from === node.id).length;
    const connected = source
      ? source.connected
      : node.id === "verbum-app" || node.id === "search" || node.id === "inbox";
    const status = source?.status ?? (terminal?.lastCommand ? "busy" : connected ? "ready" : "idle");

    return {
      ...node,
      source,
      connected,
      status,
      category: graphNodeLabel(node.id, source, node.type),
      messageCount,
      threadCount,
      inbound,
      outbound
    };
  });

  const selectedDescriptor =
    graphDescriptors.find((descriptor) => descriptor.id === selectedId) ?? graphDescriptors[0];
  const focusedDescriptor =
    graphDescriptors.find((descriptor) => descriptor.id === focusedNodeId) ?? selectedDescriptor;

  const relatedFlows = graphEdges.map((edge, index) => {
    const traffic =
      (messageCountBySource.get(edge.from) ?? 0) + (messageCountBySource.get(edge.to) ?? 0);
    const fromLabel = graphNodes.find((node) => node.id === edge.from)?.label ?? edge.from;
    const toLabel = graphNodes.find((node) => node.id === edge.to)?.label ?? edge.to;

    return {
      ...edge,
      fromLabel,
      toLabel,
      traffic,
      active: index === pulseIndex,
      related: edge.from === selectedId || edge.to === selectedId
    };
  });

  const visibleFlows = relatedFlows.filter((flow) => {
    if (graphFocus === "all") {
      return true;
    }

    if (graphFocus === "live") {
      return flow.active || flow.related;
    }

    return flow.related;
  });

  const visibleNodeIds = new Set<string>(["verbum-app", selectedId, focusedNodeId]);
  for (const flow of visibleFlows) {
    visibleNodeIds.add(flow.from);
    visibleNodeIds.add(flow.to);
  }

  const selectedNodeMessages = allMessages
    .filter((message) => message.sourceId === selectedId)
    .slice(-3)
    .reverse();
  const selectedConversationMessages = messagesByConversation.get(selectedConversationId) ?? [];
  const selectedConversationLatest = selectedConversationMessages[0];
  const selectedConversationSources = [
    ...new Map(
      selectedConversationMessages.map((message) => [
        message.sourceId,
        {
          id: message.sourceId,
          name: message.sourceLabel,
          kind: message.sourceKind
        }
      ])
    ).values()
  ];
  const threadFilterOptions: ThreadFilter[] = ["all", "verbum", "claude-code", "codex", "terminal"];

  const liveMatches = [...searchDocuments]
    .map((document) => ({ document, score: scoreDocument(deferredQuery, document) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
  const activeTabCopy = tabCopy[activeTab];

  const tickerItems = [
    ...busEvents.slice(-8).map((event) => ({
      key: `event-${event}`,
      label: "bus",
      title: event,
      meta: "global activity"
    })),
    ...globalMessages.slice(0, 10).map((message) => ({
      key: message.id,
      label: message.sourceLabel,
      title: message.title,
      meta: `${message.conversationTitle} · ${message.timestamp}`
    }))
  ];

  const tickPulse = useEffectEvent(() => {
    setPulseIndex((current) => (current + 1) % graphEdges.length);
  });

  useEffect(() => {
    const interval = window.setInterval(() => tickPulse(), 1700);
    return () => window.clearInterval(interval);
  }, [tickPulse]);

  useEffect(() => {
    let unsubscribe = () => {};

    void window.verbumApp.getSnapshot().then((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });
    void window.verbumApp.getSetupStatus().then((nextSetupStatus) => {
      setSetupStatus(nextSetupStatus);
    });

    unsubscribe = window.verbumApp.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    return () => unsubscribe();
  }, []);

  const refreshSetupStatus = useEffectEvent(async () => {
    const nextSetupStatus = await window.verbumApp.getSetupStatus();
    setSetupStatus(nextSetupStatus);
  });

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    if (!snapshot.sources.some((source) => source.id === routeTo)) {
      const preferredRoute =
        snapshot.sources.find((source) => source.id === "claude-code" || source.id === "codex")?.id ??
        snapshot.sources[0]?.id;
      if (preferredRoute) {
        setRouteTo(preferredRoute);
      }
    }

    if (!snapshot.conversations.some((conversation) => conversation.id === selectedConversationId)) {
      setSelectedConversationId(snapshot.conversations[0]?.id ?? "master");
    }
  }, [routeTo, selectedConversationId, snapshot]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-stack">
          <div className="brand-bar">
            <img alt="Verbum icon" className="brand-mark" src={verbumMacIcon} />
            <div className="brand-copy">
              <strong>Verbum</strong>
              <span>Operator view</span>
            </div>
          </div>
          <span className="eyebrow">Mac App</span>
          <h1>{activeTabCopy.title}</h1>
          <p>{activeTabCopy.description}</p>
          <div className="header-chips">
            <span className="header-chip">{selectedConversation?.title ?? "Master conversation"}</span>
            <span className="header-chip">Route {selectedSource.name}</span>
            <span className="header-chip">Active {activeEdge.label}</span>
          </div>
        </div>
        <div className="topbar-metrics">
          <article className="metric-card">
            <span>Workspace</span>
            <strong>{compactPath(snapshot?.workspaceRoot ?? "loading")}</strong>
          </article>
          <article className="metric-card">
            <span>Connected</span>
            <strong>{sources.filter((source) => source.connected).length}</strong>
          </article>
          <article className="metric-card">
            <span>Messages</span>
            <strong>{allMessages.length}</strong>
          </article>
          <article className="metric-card">
            <span>Focus</span>
            <strong>{titleCase(activeTab)}</strong>
          </article>
        </div>
      </header>

      <div className="mode-tabs">
        {([
          ["chat", "Chat"],
          ["feed", "Feed"],
          ["graph", "Graph"]
        ] as const).map(([value, label]) => (
          <button
            className={activeTab === value ? "mode-tab mode-tab-active" : "mode-tab"}
            key={value}
            onClick={() => setActiveTab(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "chat" ? (
        <div className="tab-layout chat-layout">
          <aside className="panel thread-rail">
            <div className="panel-head panel-head-inline">
              <div>
                <span className="eyebrow">Threads</span>
                <p>Browse machine conversations by source and jump straight into the one you need.</p>
              </div>
              <button
                className="action-button"
                onClick={() => {
                  void window.verbumApp
                    .spawnConversation({ title: `Side thread ${conversations.length}` })
                    .then((conversation) => setSelectedConversationId(conversation.id));
                }}
                type="button"
              >
                New thread
              </button>
            </div>

            <div className="thread-filter-row">
              {threadFilterOptions.map((filter) => (
                <button
                  className={threadFilter === filter ? "thread-filter thread-filter-active" : "thread-filter"}
                  key={filter}
                  onClick={() => setThreadFilter(filter)}
                  type="button"
                >
                  {threadFilterLabel(filter)}
                </button>
              ))}
            </div>

            <div className="conversation-list">
              {filteredConversationSections.map((section) => (
                <section className="conversation-section" key={section.key}>
                  <div className="thread-section-head">
                    <span className="eyebrow">{section.label}</span>
                    <span>{section.items.length}</span>
                  </div>
                  <div className="conversation-section-list">
                    {section.items.map((conversation: ConversationSummary) => {
                      const messages = messagesByConversation.get(conversation.id) ?? [];
                      const count = messages.length;
                      const latestMessage = messages[0];
                      const sourceName =
                        conversation.sourceLabel ??
                        latestMessage?.sourceLabel ??
                        (conversation.kind === "master" ? "Verbum" : "Side thread");

                      return (
                        <button
                          className={`session-card ${
                            conversation.id === selectedConversationId ? "session-card-active" : ""
                          }`}
                          key={conversation.id}
                          onClick={() => setSelectedConversationId(conversation.id)}
                          type="button"
                        >
                          <div className="session-card-row">
                            <strong>{conversation.title}</strong>
                            <span>{latestMessage?.timestamp ?? conversation.lastActivity}</span>
                          </div>
                          <p>{previewMessage(latestMessage)}</p>
                          <div className="session-card-meta">
                            <span>{sourceName}</span>
                            <span>{count} msgs</span>
                          </div>
                          <small>
                            {conversation.externalThreadId
                              ? `Thread ${conversation.externalThreadId.slice(0, 8)} · `
                              : ""}
                            Last activity {conversation.lastActivity}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </aside>

          <section className="panel conversation-workspace">
            {needsSetup ? (
              <section className="setup-panel">
                <div className="setup-panel-copy">
                  <span className="eyebrow">Setup Assistant</span>
                  <h3>Finish the machine-level install.</h3>
                  <p>
                    Verbum App is installed, but the `verbum-ai` package and the background helper still
                    need to be set up on this machine.
                  </p>
                </div>

                <div className="setup-grid">
                  <article className="setup-card">
                    <div className="setup-card-row">
                      <strong>Core package</strong>
                      <span>{setupStatus?.packageInstalled ? `v${setupStatus.packageVersion}` : "Not installed"}</span>
                    </div>
                    <p>Installs the global `verbum-ai` package so engineers can use the framework and CLI locally.</p>
                    <button
                      className="setup-action"
                      disabled={setupBusy !== null}
                      onClick={() => {
                        setSetupBusy("package");
                        setSetupNotice("");
                        void window.verbumApp
                          .installCorePackage()
                          .then((result) => {
                            setSetupNotice(result);
                            return refreshSetupStatus();
                          })
                          .catch((error: unknown) => {
                            setSetupNotice(error instanceof Error ? error.message : String(error));
                          })
                          .finally(() => setSetupBusy(null));
                      }}
                      type="button"
                    >
                      {setupBusy === "package"
                        ? "Installing..."
                        : setupStatus?.packageInstalled
                          ? "Reinstall package"
                          : "Install package"}
                    </button>
                  </article>

                  <article className="setup-card">
                    <div className="setup-card-row">
                      <strong>Helper service</strong>
                      <span>
                        {setupStatus?.serviceRunning
                          ? "Running"
                          : setupStatus?.serviceInstalled
                            ? "Installed"
                            : "Not installed"}
                      </span>
                    </div>
                    <p>Registers a LaunchAgent so Verbum can keep a local machine heartbeat outside the app window.</p>
                    <button
                      className="setup-action"
                      disabled={setupBusy !== null}
                      onClick={() => {
                        setSetupBusy("service");
                        setSetupNotice("");
                        void window.verbumApp
                          .installHelperService()
                          .then((result) => {
                            setSetupNotice(result);
                            return refreshSetupStatus();
                          })
                          .catch((error: unknown) => {
                            setSetupNotice(error instanceof Error ? error.message : String(error));
                          })
                          .finally(() => setSetupBusy(null));
                      }}
                      type="button"
                    >
                      {setupBusy === "service"
                        ? "Installing..."
                        : setupStatus?.serviceRunning
                          ? "Reinstall service"
                          : "Install service"}
                    </button>
                  </article>

                  <article className="setup-card setup-card-compact">
                    <div className="setup-card-row">
                      <strong>Sources</strong>
                      <span>
                        {setupStatus?.claudeInstalled ? "Claude ready" : "Claude missing"} /{" "}
                        {setupStatus?.codexInstalled ? "Codex ready" : "Codex missing"}
                      </span>
                    </div>
                    <p>
                      {setupStatus?.gatekeeperWarning
                        ? "This build is not notarized yet. If macOS blocks it, use Open Anyway in Privacy & Security or remove quarantine manually."
                        : "macOS security checks look clean."}
                    </p>
                    <code className="setup-command">xattr -dr com.apple.quarantine /Applications/Verbum.app</code>
                  </article>
                </div>

                {setupNotice ? <p className="setup-notice">{setupNotice}</p> : null}
              </section>
            ) : null}

            <section className="thread-header-card">
              <div className="thread-header-copy">
                <div className="thread-title-row">
                  <h2>{selectedConversation?.title ?? "Master conversation"}</h2>
                  <span className="status-pill">{threadMessages.length} messages</span>
                </div>
                <p>
                  {selectedConversation?.kind === "imported"
                    ? `${selectedConversation.sourceLabel ?? "Imported"} conversation imported into Verbum.`
                    : "Messages from connected sources appear here with their original structure preserved."}
                </p>
              </div>
              <div className="thread-summary-row">
                <article className="thread-summary-card">
                  <span>Primary source</span>
                  <strong>{selectedConversationLatest?.sourceLabel ?? selectedConversation?.sourceLabel ?? "Verbum"}</strong>
                </article>
                <article className="thread-summary-card">
                  <span>Last activity</span>
                  <strong>{selectedConversationLatest?.timestamp ?? selectedConversation?.lastActivity ?? "Now"}</strong>
                </article>
                <article className="thread-summary-card">
                  <span>Participants</span>
                  <strong>{selectedConversationSources.length || 1}</strong>
                </article>
              </div>
            </section>

            <div className="demo-toolbar">
              <button className="search-button" onClick={() => void window.verbumApp.runLaunchDemo()} type="button">
                Run 2-minute demo
              </button>
              <button
                className="action-button"
                onClick={() =>
                  void window.verbumApp.sendContextPrompt({
                    routeTo,
                    conversationId: selectedConversationId,
                    lookbackDays: 7,
                    prompt:
                      "Look at what I have done this week across all Verbum, Claude Code, Codex, and terminal threads on this machine. Write a report covering accomplishments, loose ends, next steps, and unresolved questions."
                  })
                }
                type="button"
              >
                Weekly report
              </button>
              {demoCommands.map((item) => (
                <button
                  className="chip"
                  key={`${item.sessionId}-${item.command}`}
                  onClick={() =>
                    void window.verbumApp.runTerminalCommand({
                      ...item,
                      conversationId: selectedConversationId
                    })
                  }
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="composer">
              <select onChange={(event) => setRouteTo(event.target.value)} value={routeTo}>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    Route to {source.name}
                  </option>
                ))}
              </select>
              <input onChange={(event) => setComposerValue(event.target.value)} value={composerValue} />
              <button
                className="composer-context-button"
                onClick={() => {
                  const content = composerValue.trim();
                  if (!content) {
                    return;
                  }

                  void window.verbumApp.sendContextPrompt({
                    routeTo,
                    prompt: content,
                    conversationId: selectedConversationId,
                    lookbackDays: 7
                  });
                }}
                type="button"
              >
                Send with week
              </button>
              <button
                onClick={() => {
                  const content = composerValue.trim();
                  if (!content) {
                    return;
                  }

                  void window.verbumApp.sendMessage({
                    routeTo,
                    content,
                    conversationId: selectedConversationId
                  });
                }}
                type="button"
              >
                Send
              </button>
            </div>

            <div className="message-feed">
              {threadMessages.length > 0 ? (
                threadMessages.map((message) => <MessageRenderer key={message.id} message={message} />)
              ) : (
                <article className="empty-state">
                  <span className="eyebrow">Quiet thread</span>
                  <h3>Nothing in this thread yet.</h3>
                  <p>Route a prompt to Claude, Codex, or a terminal to start the conversation.</p>
                </article>
              )}
            </div>
          </section>

          <aside className="panel tab-inspector">
            <div className="panel-head">
              <span className="eyebrow">Details</span>
              <h2>{selectedConversation?.title ?? "Conversation"}</h2>
              <p>Clean thread details, involved sources, and the current route target.</p>
            </div>

            <div className="inspector-metrics">
              <div>
                <span>Kind</span>
                <strong>{selectedConversation?.kind ?? "thread"}</strong>
              </div>
              <div>
                <span>Route</span>
                <strong>{selectedSource.name}</strong>
              </div>
              <div>
                <span>Thread id</span>
                <strong>{selectedConversation?.externalThreadId?.slice(0, 8) ?? "local"}</strong>
              </div>
            </div>

            <section className="thread-detail-section">
              <div className="panel-head">
                <span className="eyebrow">Participants</span>
                <p>Sources currently represented inside this thread.</p>
              </div>
              <div className="source-palette">
                {selectedConversationSources.length > 0 ? (
                  selectedConversationSources.map((source) => (
                    <span className="source-pill source-pill-static" key={source.id}>
                      <span className={`status-dot ${source.id === routeTo ? "status-dot-online" : "status-dot-idle"}`}></span>
                      {source.name}
                    </span>
                  ))
                ) : (
                  <span className="source-pill source-pill-static">Verbum</span>
                )}
              </div>
            </section>

            <section className="thread-detail-section">
              <div className="panel-head">
                <span className="eyebrow">Route target</span>
                <p>Choose where the next message should go.</p>
              </div>
              <div className="source-palette">
                {sources.map((source: SourceDescriptor) => (
                  <button
                    className={`source-pill ${source.id === routeTo ? "source-pill-active" : ""}`}
                    key={source.id}
                    onClick={() => setRouteTo(source.id)}
                    type="button"
                  >
                    <span className={`status-dot ${source.connected ? "status-dot-online" : "status-dot-idle"}`}></span>
                    {source.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="thread-detail-section">
              <div className="panel-head">
                <span className="eyebrow">Latest in thread</span>
                <p>Most recent message context for the open chat.</p>
              </div>
              {selectedConversationLatest ? (
                <article className="activity-card">
                  <div className="activity-card-row">
                    <strong>{selectedConversationLatest.sourceLabel}</strong>
                    <span>{selectedConversationLatest.timestamp}</span>
                  </div>
                  <p>{previewMessage(selectedConversationLatest)}</p>
                </article>
              ) : (
                <article className="activity-card">
                  <p>No activity yet in this thread.</p>
                </article>
              )}
            </section>
          </aside>
        </div>
      ) : null}

      {activeTab === "feed" ? (
        <div className="tab-layout feed-layout-tab">
          <section className="panel feed-main">
            <div className="panel-head panel-head-inline">
              <div>
                <span className="eyebrow">Global Feed</span>
                <h2>Recent activity across connected sources.</h2>
                <p>Bus events, model replies, tool output, and terminal activity appear here in time order.</p>
              </div>
              <span className="status-pill">{globalMessages.length} total messages</span>
            </div>

            <div className="feed-activity-grid">
              <article className="graph-summary-card">
                <span>Latest path</span>
                <strong>{activeEdge.label}</strong>
                <p>
                  {graphNodes.find((node) => node.id === activeEdge.from)?.label} to{" "}
                  {graphNodes.find((node) => node.id === activeEdge.to)?.label}
                </p>
              </article>
              <article className="graph-summary-card">
                <span>Bus events</span>
                <strong>{busEvents.length}</strong>
                <p>High-level activity crossing the whole system.</p>
              </article>
              <article className="graph-summary-card">
                <span>Connected sources</span>
                <strong>{sources.filter((source) => source.connected).length}</strong>
                <p>Visible participants contributing to the feed.</p>
              </article>
            </div>

            <div className="global-feed-list">
              {globalMessages.map((message) => (
                <MessageRenderer key={message.id} message={message} />
              ))}
            </div>
          </section>

          <aside className="feed-side">
            <section className="panel ticker-panel">
              <div className="panel-head">
                <span className="eyebrow">Ticker</span>
                <p>A downward-running activity stream for the whole machine.</p>
              </div>
              <div className="ticker-window">
                <div className="ticker-track">
                  {[...tickerItems, ...tickerItems].map((item, index) => (
                    <article className="ticker-item" key={`${item.key}-${index}`}>
                      <span>{item.label}</span>
                      <strong>{item.title}</strong>
                      <p>{item.meta}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <span className="eyebrow">Source Activity</span>
                <p>Quick source health without leaving the feed.</p>
              </div>
              <div className="source-stack">
                {sources.map((source) => (
                  <article className="activity-card" key={source.id}>
                    <div className="activity-card-row">
                      <strong>{source.name}</strong>
                      <span>{messageCountBySource.get(source.id) ?? 0} msgs</span>
                    </div>
                    <p>{source.subtitle}</p>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {activeTab === "graph" ? (
        <div className="tab-layout graph-layout">
          <section className="panel graph-workspace">
            <div className="panel-head panel-head-inline">
              <div>
                <span className="eyebrow">Conversation Graph</span>
                <h2>System map, not decoration.</h2>
                <p>View connected sources, active paths, and the relationships between conversations.</p>
              </div>
              <div className="graph-toolbar-shell">
                {([
                  ["selected", "Selected"],
                  ["live", "Live"],
                  ["all", "All"]
                ] as const).map(([value, label]) => (
                  <button
                    className={graphFocus === value ? "graph-toggle graph-toggle-active" : "graph-toggle"}
                    key={value}
                    onClick={() => setGraphFocus(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="graph-summary-grid">
              <article className="graph-summary-card">
                <span>Focused node</span>
                <strong>{focusedDescriptor.label}</strong>
                <p>
                  {focusedDescriptor.messageCount} messages across{" "}
                  {focusedDescriptor.threadCount || 1} {focusedDescriptor.threadCount === 1 ? "thread" : "threads"}
                </p>
              </article>
              <article className="graph-summary-card">
                <span>Visible flows</span>
                <strong>{visibleFlows.length}</strong>
                <p>{graphFocus === "all" ? "Whole topology" : "Filtered graph view"}</p>
              </article>
              <article className="graph-summary-card">
                <span>Active edge</span>
                <strong>{activeEdge.label}</strong>
                <p>
                  {graphNodes.find((node) => node.id === activeEdge.from)?.label} to{" "}
                  {graphNodes.find((node) => node.id === activeEdge.to)?.label}
                </p>
              </article>
            </div>

            <div className="graph-stage graph-stage-clean">
              <div className="graph-stage-inner">
                <div className="graph-grid" aria-hidden></div>
                <div className="graph-orbit graph-orbit-a" aria-hidden></div>
                <div className="graph-orbit graph-orbit-b" aria-hidden></div>
                <div
                  className="graph-spotlight"
                  style={{
                    left: `${focusedDescriptor.x}%`,
                    top: `${focusedDescriptor.y}%`
                  }}
                ></div>

                <svg className="graph-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                  {relatedFlows.map((edge, index) => {
                    const from = graphNodes.find((node) => node.id === edge.from);
                    const to = graphNodes.find((node) => node.id === edge.to);

                    if (!from || !to || !visibleFlows.some((flow) => flow.from === edge.from && flow.to === edge.to)) {
                      return null;
                    }

                    const dx = Math.abs(to.x - from.x);
                    const dy = Math.abs(to.y - from.y);
                    const tension = Math.max(dx, dy) * 0.35;
                    const curve = `M ${from.x} ${from.y} C ${from.x + (to.x > from.x ? tension : -tension)} ${from.y}, ${to.x + (from.x > to.x ? tension : -tension)} ${to.y}, ${to.x} ${to.y}`;
                    return (
                      <g key={`${edge.from}-${edge.to}`}>
                        <path
                          className={index === pulseIndex ? "graph-path graph-path-active" : "graph-path"}
                          d={curve}
                        />
                        {index === pulseIndex ? (
                          <>
                            <circle className="graph-packet" r="1.05">
                              <animateMotion dur="2.4s" repeatCount="indefinite" path={curve} />
                            </circle>
                            <circle className="graph-packet graph-packet-delayed" r="0.85">
                              <animateMotion
                                begin="0.7s"
                                dur="2.4s"
                                repeatCount="indefinite"
                                path={curve}
                              />
                            </circle>
                          </>
                        ) : null}
                      </g>
                    );
                  })}
                </svg>

                {graphDescriptors.map((node) => (
                  <button
                    className={`graph-node graph-node-${node.type} ${
                      node.id === selectedId ? "graph-node-active" : ""
                    } ${!visibleNodeIds.has(node.id) ? "graph-node-muted" : ""} ${
                      node.id === "verbum-app" ? "graph-node-core" : ""
                    } ${
                      node.type === "memory" || node.type === "human" ? "graph-node-compact" : ""
                    }`}
                    data-node-id={node.id}
                    key={node.id}
                    onClick={() => setSelectedId(node.id)}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
                    style={{
                      left: `${node.x}%`,
                      top: `${node.y}%`
                    }}
                    title={`${node.label} · ${node.messageCount} messages`}
                    type="button"
                  >
                    <div className="graph-node-topline">
                      <strong>{node.label}</strong>
                      <span className={`status-dot ${node.connected ? "status-dot-online" : "status-dot-idle"}`}></span>
                    </div>
                  <span className="graph-node-kind">{node.category}</span>
                  <div className="graph-node-stats">
                    <b>{node.messageCount}</b>
                    <span>
                      {node.threadCount || 1} {node.threadCount === 1 ? "thread" : "threads"}
                    </span>
                  </div>
                </button>
              ))}
              </div>
            </div>
          </section>

          <aside className="panel graph-inspector">
            <div className="panel-head">
              <span className="eyebrow">Inspector</span>
              <h2>{focusedDescriptor.label}</h2>
              <p>{focusedDescriptor.detail}</p>
            </div>

            <div className="inspector-metrics">
              <div>
                <span>Status</span>
                <strong>{focusedDescriptor.status}</strong>
              </div>
              <div>
                <span>Edges</span>
                <strong>
                  {focusedDescriptor.inbound} in / {focusedDescriptor.outbound} out
                </strong>
              </div>
              <div>
                <span>Threads</span>
                <strong>{focusedDescriptor.threadCount || 1}</strong>
              </div>
              <div>
                <span>Category</span>
                <strong>{focusedDescriptor.category}</strong>
              </div>
            </div>

            <div className="graph-flow-list">
              {visibleFlows.map((flow) => (
                <button
                  className={`graph-flow-item ${
                    flow.active ? "graph-flow-item-active" : ""
                  } ${flow.related ? "graph-flow-item-related" : ""}`}
                  key={`${flow.from}-${flow.to}`}
                  onClick={() => setSelectedId(flow.from === selectedId ? flow.to : flow.from)}
                  type="button"
                >
                  <strong>{flow.label}</strong>
                  <span>
                    {flow.fromLabel} to {flow.toLabel}
                  </span>
                  <b>{flow.traffic} touches</b>
                </button>
              ))}
            </div>

            {selectedNodeMessages.length > 0 ? (
              <div className="node-activity">
                <div className="panel-head">
                  <span className="eyebrow">Recent Activity</span>
                  <p>Latest messages touching {selectedDescriptor.label}.</p>
                </div>
                <div className="node-activity-list">
                  {selectedNodeMessages.map((message) => (
                    <article className="node-activity-item" key={message.id}>
                      <strong>{message.title}</strong>
                      <span>{message.timestamp}</span>
                      <p>{message.blocks[0]?.type === "markdown" ? message.blocks[0].text : message.sourceLabel}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            <form
              className="search-form"
              onSubmit={(event) => {
                event.preventDefault();
                const question = query.trim();
                if (!question) {
                  return;
                }

                const answer = answerQuery(question);
                startTransition(() => {
                  setSearchTurns((current) => [
                    ...current,
                    { role: "user", content: question },
                    { role: "assistant", content: answer.summary, citations: answer.citations }
                  ]);
                });
              }}
            >
              <input
                className="search-input"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ask about this graph"
                value={query}
              />
              <button className="search-button" type="submit">
                Ask
              </button>
            </form>

            <div className="search-log">
              {searchTurns.slice(-4).map((turn, index) => (
                <article className={`search-turn search-turn-${turn.role}`} key={`${turn.role}-${index}`}>
                  <span>{turn.role === "user" ? "You" : "Verbum Search"}</span>
                  <p>{turn.content}</p>
                  {turn.citations ? (
                    <div className="citation-row">
                      {turn.citations.map((citation) => (
                        <b className="citation" key={citation.id}>
                          {citation.kind}: {citation.title}
                        </b>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="live-matches">
              <strong>Live matches</strong>
              <ul>
                {liveMatches.map(({ document, score }) => (
                  <li key={document.id}>
                    <span>
                      {document.title} · {score}
                    </span>
                    <p>{document.excerpt}</p>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
