import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState
} from "react";

import {
  graphEdges,
  graphNodes,
  inboxThread,
  onboardingSteps,
  searchDocuments
} from "./demo-data";
import { MessageRenderer } from "./MessageRenderer";
import type { BridgeSnapshot, ConversationSummary, SourceDescriptor } from "./message-schema";

type SearchCitation = (typeof searchDocuments)[number];

function scoreDocument(query: string, document: SearchCitation): number {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  const haystack = `${document.title} ${document.kind} ${document.tags.join(" ")} ${document.excerpt}`.toLowerCase();
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
        "Verbum App still centers the same answer: it is the native layer above Claude Code, Codex, and your terminals, with search and inbox stitched into the graph.",
      citations: searchDocuments.slice(0, 2)
    };
  }

  return {
    summary: citations.map((citation) => citation.excerpt).join(" "),
    citations
  };
}

export function App() {
  const [selectedId, setSelectedId] = useState("verbum-app");
  const [selectedConversationId, setSelectedConversationId] = useState("master");
  const [query, setQuery] = useState("How does the app orchestrate Claude Code, Codex, and terminals?");
  const [pulseIndex, setPulseIndex] = useState(0);
  const [routeTo, setRouteTo] = useState("claude-code");
  const [composerValue, setComposerValue] = useState(
    "Summarize the latest build result and route the fix to Claude Code."
  );
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [searchTurns, setSearchTurns] = useState<
    Array<{ role: "assistant" | "user"; content: string; citations?: SearchCitation[] }>
  >(() => {
    const answer = answerQuery("How does the app orchestrate Claude Code, Codex, and terminals?");
    return [{ role: "assistant", content: answer.summary, citations: answer.citations }];
  });

  const deferredQuery = useDeferredValue(query);
  const sources = snapshot?.sources ?? [];
  const conversations = snapshot?.conversations ?? [];
  const feed = (snapshot?.messages ?? []).filter(
    (message) => message.conversationId === selectedConversationId
  );
  const busEvents = snapshot?.busEvents ?? ["Verbum App is booting…"];
  const terminals = snapshot?.terminals ?? [];
  const demoCommands = snapshot?.demoCommands ?? [];
  const selectedNode = graphNodes.find((node) => node.id === selectedId) ?? graphNodes[0];
  const selectedSource =
    sources.find((descriptor) => descriptor.id === selectedId) ??
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
        <div>
          <span className="eyebrow">Verbum App</span>
          <h1>The god-view of every conversation on your machine.</h1>
        </div>
        <div className="topbar-metrics">
          <span>macOS desktop app</span>
          <span>{sources.length} sources</span>
          <span>{conversations.length} conversations</span>
          <span>{sources.filter((source) => source.connected).length} connected</span>
          <span>{snapshot?.workspaceRoot ?? "loading workspace"}</span>
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
          <div className="panel-head">
            <span className="eyebrow">Start Here</span>
            <p>Friendly enough for first-time users, typed enough for engineers to extend.</p>
          </div>
          <ol className="onboarding-list">
            {onboardingSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="panel-head panel-head-inline">
            <div>
              <span className="eyebrow">Conversations</span>
              <p>Your main thread with Verbum is the master conversation. Spawn others when needed.</p>
            </div>
            <button
              className="chip"
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
            {conversations.map((conversation: ConversationSummary) => (
              <button
                className={`session-card ${
                  conversation.id === selectedConversationId ? "session-card-active" : ""
                }`}
                key={conversation.id}
                onClick={() => setSelectedConversationId(conversation.id)}
                type="button"
              >
                <strong>{conversation.title}</strong>
                <span>{conversation.status}</span>
                <p>Last activity {conversation.lastActivity}</p>
              </button>
            ))}
          </div>
          <div className="panel-head">
            <span className="eyebrow">Sources</span>
            <p>Companion app today, replacement interface when you want it.</p>
          </div>
          <div className="session-list">
            {sources.map((source: SourceDescriptor) => (
              <button
                className={`session-card ${source.id === selectedId ? "session-card-active" : ""}`}
                key={source.id}
                onClick={() => setSelectedId(source.id)}
                type="button"
              >
                <strong>{source.name}</strong>
                <span>{source.mode}</span>
                <p>{source.subtitle}</p>
                <em>{source.status}</em>
                <small>{source.typing}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="center-column">
          <section className="panel graph-panel">
            <div className="panel-head panel-head-inline">
              <div>
                <span className="eyebrow">Conversation Graph</span>
                <p>Claude Code, Codex, search, inbox, and terminals in one live constellation.</p>
              </div>
              <span className="status-pill">Active edge {pulseIndex + 1}</span>
            </div>

            <div className="graph-stage">
              <svg className="graph-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {graphEdges.map((edge, index) => {
                  const from = graphNodes.find((node) => node.id === edge.from);
                  const to = graphNodes.find((node) => node.id === edge.to);

                  if (!from || !to) {
                    return null;
                  }

                  const curve = `M ${from.x} ${from.y} C ${from.x} ${(from.y + to.y) / 2 - 12}, ${to.x} ${(from.y + to.y) / 2 + 12}, ${to.x} ${to.y}`;
                  return (
                    <path
                      className={index === pulseIndex ? "graph-path graph-path-active" : "graph-path"}
                      d={curve}
                      key={`${edge.from}-${edge.to}`}
                    />
                  );
                })}
              </svg>

              {graphNodes.map((node) => (
                <button
                  className={`graph-node graph-node-${node.type} ${
                    node.id === selectedId ? "graph-node-active" : ""
                  }`}
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    transform: `translate(-50%, -50%) translateZ(${node.z}px)`
                  }}
                  type="button"
                >
                  <strong>{node.label}</strong>
                  <span>{node.type}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel terminal-panel">
            <div className="panel-head panel-head-inline">
              <div>
                <span className="eyebrow">Message Feed</span>
                <p>Claude Code, Codex, terminals, humans, and custom sources all render in one thread.</p>
              </div>
              <span className="status-pill">{feed.length} typed messages</span>
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
              <input
                onChange={(event) => setComposerValue(event.target.value)}
                value={composerValue}
              />
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
              {feed.map((message) => (
                <MessageRenderer key={message.id} message={message} />
              ))}
            </div>
            <div className="terminal-grid">
              {terminals.map((terminal) => (
                <article className="terminal-card" key={terminal.id}>
                  <strong>{terminal.title}</strong>
                  <pre>{terminal.lines.join("\n")}</pre>
                </article>
              ))}
            </div>
          </section>
        </main>

        <aside className="right-column">
          <section className="panel inspector-panel">
            <div className="panel-head">
              <span className="eyebrow">Inspector</span>
              <h2>{selectedNode.label}</h2>
              <p>{selectedNode.detail}</p>
            </div>
            <div className="inspector-metrics">
              <div>
                <span>Selected Source</span>
                <strong>{selectedSource.name}</strong>
              </div>
              <div>
                <span>Conversation</span>
                <strong>
                  {conversations.find((conversation) => conversation.id === selectedConversationId)?.title ??
                    "Master conversation"}
                </strong>
              </div>
              <div>
                <span>Typed Support</span>
                <strong>{selectedSource.typing}</strong>
              </div>
            </div>
            <div className="thread">
              {inboxThread.map((entry) => (
                <article className="thread-item" key={`${entry.author}-${entry.route}`}>
                  <strong>{entry.author}</strong>
                  <span>{entry.route}</span>
                  <p>{entry.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel search-panel">
            <div className="panel-head">
              <span className="eyebrow">Conversational Search</span>
              <p>Fast, local, and grounded in the launch docs.</p>
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
                placeholder="Ask about the launch story"
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
                "Why skip collaboration for launch?"
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
            <div className="custom-source-card">
              <strong>Bring your own source</strong>
              <p>
                If another system can emit typed message blocks, Verbum can render it beside Claude Code
                and Codex without a custom one-off pane.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
