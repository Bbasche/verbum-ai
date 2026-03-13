import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState
} from "react";

import { graphEdges, graphNodes, inboxThread, searchDocuments } from "./demo-data";
import { MessageRenderer } from "./MessageRenderer";
import type { BridgeSnapshot, ConversationSummary, SourceDescriptor } from "./message-schema";
import verbumLogoDark from "./assets/verbum-logo-dark.png";
import verbumMacIcon from "./assets/verbum-mac-icon-1024.png";

type SearchCitation = (typeof searchDocuments)[number];
type DetailTab = "inspector" | "search";
type GraphFocus = "all" | "selected" | "live";

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
        "Verbum App keeps the machine readable: master conversation in focus, graph activity above it, and search on demand instead of everywhere at once.",
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

export function App() {
  const [selectedId, setSelectedId] = useState("verbum-app");
  const [selectedConversationId, setSelectedConversationId] = useState("master");
  const [query, setQuery] = useState("How does Verbum orchestrate Claude Code, Codex, and terminals?");
  const [pulseIndex, setPulseIndex] = useState(0);
  const [routeTo, setRouteTo] = useState("claude-code");
  const [detailTab, setDetailTab] = useState<DetailTab>("inspector");
  const [graphFocus, setGraphFocus] = useState<GraphFocus>("selected");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState(
    "Summarize the latest build result and route the fix to Claude Code."
  );
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
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
  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0];
  const feed = allMessages.filter((message) => message.conversationId === selectedConversationId);
  const activeEdge = graphEdges[pulseIndex] ?? graphEdges[0];
  const focusedNodeId = hoveredNodeId ?? selectedId;
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const terminalById = new Map(terminals.map((terminal) => [terminal.id, terminal]));
  const messageCountBySource = new Map<string, number>();

  for (const message of allMessages) {
    messageCountBySource.set(message.sourceId, (messageCountBySource.get(message.sourceId) ?? 0) + 1);
  }

  const graphDescriptors = graphNodes.map((node) => {
    const source = sourceById.get(node.id);
    const terminal = terminalById.get(node.id);
    const messageCount = messageCountBySource.get(node.id) ?? 0;
    const inbound = graphEdges.filter((edge) => edge.to === node.id).length;
    const outbound = graphEdges.filter((edge) => edge.from === node.id).length;
    const connected = source ? source.connected : node.id === "verbum-app" || node.id === "search" || node.id === "inbox";
    const status = source?.status ?? (terminal?.lastCommand ? "busy" : connected ? "ready" : "idle");
    const accent = source?.mode ?? titleCase(node.type);
    const summary = terminal?.lastCommand
      ? `Last command: ${terminal.lastCommand}`
      : source?.subtitle ?? node.detail;

    return {
      ...node,
      source,
      terminal,
      connected,
      status,
      accent,
      summary,
      messageCount,
      inbound,
      outbound
    };
  });

  const selectedDescriptor =
    graphDescriptors.find((descriptor) => descriptor.id === selectedId) ?? graphDescriptors[0];
  const focusedDescriptor =
    graphDescriptors.find((descriptor) => descriptor.id === focusedNodeId) ?? selectedDescriptor;
  const selectedSource =
    selectedDescriptor?.source ??
    sources[0] ?? {
      id: "verbum-app",
      name: "Verbum App",
      kind: "custom",
      subtitle: "Unified desktop control room",
      mode: "replacement",
      connected: true,
      typing: "graph, inbox, search, typed source registry",
      status: "starting"
    };
  const relatedFlows = graphEdges.map((edge, index) => {
    const traffic =
      (messageCountBySource.get(edge.from) ?? 0) + (messageCountBySource.get(edge.to) ?? 0);
    const from = graphNodes.find((node) => node.id === edge.from)?.label ?? edge.from;
    const to = graphNodes.find((node) => node.id === edge.to)?.label ?? edge.to;

    return {
      ...edge,
      fromLabel: from,
      toLabel: to,
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
  const liveMatches = [...searchDocuments]
    .map((document) => ({ document, score: scoreDocument(deferredQuery, document) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);

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

    unsubscribe = window.verbumApp.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    return () => unsubscribe();
  }, []);

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
            <img alt="Verbum" className="brand-wordmark" src={verbumLogoDark} />
          </div>
          <span className="eyebrow">Verbum App</span>
          <h1>Machine conversations, made legible.</h1>
          <p>Master thread first. Graph above. Context on demand.</p>
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
            <span>Active flow</span>
            <strong>{activeEdge.label}</strong>
          </article>
          <article className="metric-card">
            <span>Thread</span>
            <strong>{selectedConversation?.title ?? "Master conversation"}</strong>
          </article>
        </div>
      </header>

      <div className="bus-strip">
        <div className="bus-marquee">
          {[...busEvents, ...busEvents].map((event, index) => (
            <span className="bus-pill" key={`${event}-${index}`}>
              {event}
            </span>
          ))}
        </div>
      </div>

      <div className="workspace">
        <aside className="sidebar panel">
          <div className="panel-head panel-head-inline">
            <div>
              <span className="eyebrow">Threads</span>
              <p>Keep the master conversation in focus. Spawn side threads only when they earn it.</p>
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

          <div className="conversation-list">
            {conversations.map((conversation: ConversationSummary) => {
              const messageCount = allMessages.filter(
                (message) => message.conversationId === conversation.id
              ).length;

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
                    <span>{conversation.status}</span>
                  </div>
                  <p>{messageCount} messages in thread</p>
                  <small>Last activity {conversation.lastActivity}</small>
                </button>
              );
            })}
          </div>

          <div className="sidebar-summary">
            <div className="sidebar-stat">
              <span>Route</span>
              <strong>{sourceById.get(routeTo)?.name ?? routeTo}</strong>
            </div>
            <div className="sidebar-stat">
              <span>Selected node</span>
              <strong>{selectedDescriptor?.label ?? "Verbum App"}</strong>
            </div>
            <div className="sidebar-stat">
              <span>Messages</span>
              <strong>{feed.length} in view</strong>
            </div>
            <div className="sidebar-stat">
              <span>Search docs</span>
              <strong>{searchDocuments.length} indexed</strong>
            </div>
          </div>

          <div className="panel-head">
            <span className="eyebrow">Sources</span>
            <p>Compact status only. The graph is the detailed source view.</p>
          </div>
          <div className="source-palette">
            {sources.map((source: SourceDescriptor) => (
              <button
                className={`source-pill ${source.id === selectedId ? "source-pill-active" : ""}`}
                key={source.id}
                onClick={() => {
                  setSelectedId(source.id);
                  setRouteTo(source.id);
                }}
                type="button"
              >
                <span className={`status-dot ${source.connected ? "status-dot-online" : "status-dot-idle"}`}></span>
                {source.name}
              </button>
            ))}
          </div>
        </aside>

        <main className="center-column">
          <section className="panel graph-panel">
            <div className="panel-head panel-head-inline">
              <div>
                <span className="eyebrow">Conversation Graph</span>
                <p>Dense enough to debug. Calm enough to understand at a glance.</p>
              </div>
              <span className="status-pill">{relatedFlows.filter((flow) => flow.active).length} active path</span>
            </div>

            <div className="graph-summary-grid">
              <article className="graph-summary-card">
                <span>Selected</span>
                <strong>{selectedDescriptor.label}</strong>
                <p>{selectedDescriptor.messageCount} messages touching this node</p>
              </article>
              <article className="graph-summary-card">
                <span>Current flow</span>
                <strong>{activeEdge.label}</strong>
                <p>
                  {graphNodes.find((node) => node.id === activeEdge.from)?.label} to{" "}
                  {graphNodes.find((node) => node.id === activeEdge.to)?.label}
                </p>
              </article>
              <article className="graph-summary-card">
                <span>Connected sources</span>
                <strong>{sources.filter((source) => source.connected).length}</strong>
                <p>{sources.length} total visible participants</p>
              </article>
            </div>

            <div className="graph-stage">
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

              <div className="graph-hud">
                <span className="eyebrow">Selected Node</span>
                <h2>{selectedDescriptor.label}</h2>
                <p>{selectedDescriptor.detail}</p>
                <div className="graph-hud-stats">
                  <div>
                    <span>Status</span>
                    <strong>{selectedDescriptor.status}</strong>
                  </div>
                  <div>
                    <span>Edges</span>
                    <strong>
                      {selectedDescriptor.inbound} in / {selectedDescriptor.outbound} out
                    </strong>
                  </div>
                  <div>
                    <span>Mode</span>
                    <strong>{selectedDescriptor.accent}</strong>
                  </div>
                </div>
              </div>

              <div className="graph-toolbar">
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

              <div className="graph-flow-rail">
                <span className="eyebrow">Live Flows</span>
                <div className="graph-flow-list">
                  {visibleFlows.map((flow) => (
                    <button
                      className={`graph-flow-item ${
                        flow.active ? "graph-flow-item-active" : ""
                      } ${flow.related ? "graph-flow-item-related" : ""}`}
                      key={`${flow.from}-${flow.to}`}
                      onClick={() => {
                        const nextNodeId = flow.from === selectedId ? flow.to : flow.from;
                        setSelectedId(nextNodeId);
                        setDetailTab("inspector");
                      }}
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
              </div>

              <svg className="graph-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {relatedFlows.map((edge, index) => {
                  const from = graphNodes.find((node) => node.id === edge.from);
                  const to = graphNodes.find((node) => node.id === edge.to);

                  if (!from || !to || !visibleFlows.some((flow) => flow.from === edge.from && flow.to === edge.to)) {
                    return null;
                  }

                  const curve = `M ${from.x} ${from.y} C ${from.x} ${(from.y + to.y) / 2 - 12}, ${to.x} ${(from.y + to.y) / 2 + 12}, ${to.x} ${to.y}`;
                  return (
                    <g key={`${edge.from}-${edge.to}`}>
                      <path
                        className={index === pulseIndex ? "graph-path graph-path-active" : "graph-path"}
                        d={curve}
                      />
                      {index === pulseIndex ? (
                        <>
                          <circle className="graph-packet" r="1.1">
                            <animateMotion dur="2.4s" repeatCount="indefinite" path={curve} />
                          </circle>
                          <circle className="graph-packet graph-packet-delayed" r="0.9">
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
                  } ${!visibleNodeIds.has(node.id) ? "graph-node-muted" : ""}`}
                  key={node.id}
                  onClick={() => {
                    setSelectedId(node.id);
                    setDetailTab("inspector");
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    transform: `translate(-50%, -50%) translateZ(${node.z}px) scale(${
                      node.id === focusedNodeId ? 1.04 : visibleNodeIds.has(node.id) ? 1 : 0.94
                    })`
                  }}
                  type="button"
                >
                  <div className="graph-node-row">
                    <span className="graph-node-kind">{node.accent}</span>
                    <span className={`status-dot ${node.connected ? "status-dot-online" : "status-dot-idle"}`}></span>
                  </div>
                  <strong>{node.label}</strong>
                  <p>{node.summary}</p>
                  <div className="graph-node-meta">
                    <span>{node.messageCount} msgs</span>
                    <span>
                      {node.inbound}/{node.outbound} edges
                    </span>
                  </div>
                  <div className="graph-node-spark"></div>
                </button>
              ))}
            </div>
          </section>

          <section className="panel terminal-panel">
            <div className="panel-head panel-head-inline">
              <div>
                <span className="eyebrow">Conversation Feed</span>
                <p>The selected thread is the primary working surface.</p>
              </div>
              <span className="status-pill">{feed.length} messages</span>
            </div>

            <div className="demo-toolbar">
              <button className="search-button" onClick={() => void window.verbumApp.runLaunchDemo()} type="button">
                Run 2-minute demo
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

            <div className="feed-layout">
              <div className="message-feed">
                {feed.map((message) => (
                  <MessageRenderer key={message.id} message={message} />
                ))}
              </div>

              <div className="terminal-grid">
                {terminals.map((terminal) => (
                  <article className="terminal-card" key={terminal.id}>
                    <div className="terminal-card-head">
                      <strong>{terminal.title}</strong>
                      <span>{compactPath(terminal.cwd)}</span>
                    </div>
                    <pre>{terminal.lines.join("\n")}</pre>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </main>

        <aside className="detail-column panel">
          <div className="detail-tabs">
            <button
              className={detailTab === "inspector" ? "detail-tab detail-tab-active" : "detail-tab"}
              onClick={() => setDetailTab("inspector")}
              type="button"
            >
              Inspector
            </button>
            <button
              className={detailTab === "search" ? "detail-tab detail-tab-active" : "detail-tab"}
              onClick={() => setDetailTab("search")}
              type="button"
            >
              Search
            </button>
          </div>

          {detailTab === "inspector" ? (
            <div className="detail-panel-body">
              <div className="panel-head">
                <span className="eyebrow">Context</span>
                <h2>{selectedDescriptor.label}</h2>
                <p>{selectedDescriptor.detail}</p>
              </div>

              <div className="inspector-metrics">
                <div>
                  <span>Source</span>
                  <strong>{selectedSource.name}</strong>
                </div>
                <div>
                  <span>Thread</span>
                  <strong>{selectedConversation?.title ?? "Master conversation"}</strong>
                </div>
                <div>
                  <span>Typed support</span>
                  <strong>{selectedSource.typing}</strong>
                </div>
              </div>

              <div className="thread">
                {(selectedNodeMessages.length > 0 ? selectedNodeMessages : inboxThread).map((entry, index) => (
                  <article className="thread-item" key={("id" in entry ? entry.id : `${entry.author}-${index}`)}>
                    <strong>{"title" in entry ? entry.title : entry.author}</strong>
                    <span>
                      {"sourceLabel" in entry
                        ? `${entry.sourceLabel} · ${entry.timestamp}`
                        : entry.route}
                    </span>
                    <p>
                      {"blocks" in entry
                        ? entry.blocks
                            .map((block) => ("text" in block ? block.text : "Structured event"))
                            .join(" ")
                        : entry.text}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="detail-panel-body">
              <div className="panel-head">
                <span className="eyebrow">Conversational Search</span>
                <p>Ask when you need context. Otherwise stay in the thread.</p>
              </div>

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
                  placeholder="Ask about the graph, threads, or launch"
                  value={query}
                />
                <button className="search-button" type="submit">
                  Ask
                </button>
              </form>

              <div className="chip-row">
                {[
                  "Why is this better than a dashboard?",
                  "How do terminals appear in the app?",
                  "Why keep the master thread central?"
                ].map((chip) => (
                  <button className="chip" key={chip} onClick={() => setQuery(chip)} type="button">
                    {chip}
                  </button>
                ))}
              </div>

              <div className="search-log">
                {searchTurns.map((turn, index) => (
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
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
