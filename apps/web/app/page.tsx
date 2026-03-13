import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <header>
        <div className="hinner">
          <Link href="/" className="wordmark">
            Verbum<span className="wdot"></span>
          </Link>
          <nav>
            <a href="#why">Why</a>
            <a href="#actors">Actors</a>
            <a href="#app">Mac App</a>
            <Link href="/docs">Docs</Link>
            <a href="https://github.com/Bbasche/verbum" className="ncta">
              GitHub →
            </a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <p className="hlabel">Open source · MIT · TypeScript</p>
          <h1>
            Everything is a
            <br />
            <em>conversation.</em>
          </h1>
          <p className="hsub">
            Verbum gives every participant in your system, AI models, terminals, MCP servers, APIs,
            humans, a seat at the table. They send messages. They receive messages. The rest is routing.
          </p>
          <div className="hact">
            <Link href="/docs" className="btnp">
              Get started →
            </Link>
            <a href="https://github.com/Bbasche/verbum" className="btns">
              Star on GitHub
            </a>
          </div>
        </div>
        <div className="istrip" style={{ marginTop: "3rem" }}>
          <div className="wide">
            <div className="icmd">
              <span className="p">$</span>
              <span className="c">npm install verbum</span>
            </div>
            <div className="ibadges">
              <span className="badge g">MIT</span>
              <span className="badge b">TypeScript</span>
              <span className="badge">Node 20+</span>
            </div>
          </div>
        </div>
      </section>

      <section className="hook" id="why">
        <div className="container">
          <div className="bar"></div>
          <h2>
            The right abstraction
            <br />
            changes everything downstream.
          </h2>
          <p>
            Most frameworks model agent systems as function calls that happen to use language. You invoke
            tools. You query models. You stitch results together. It works until you need to observe it,
            debug it, replay it, or hand control to a human.
          </p>
          <p>
            Verbum starts from a different premise. <strong>Every participant is an Actor. Every
            interaction is a Message.</strong> Your terminal is not a tool, it is in the conversation.
            Your MCP server is not a plugin, it is a participant. Your human is not a callback, they are
            first-class.
          </p>
          <blockquote>
            What if every part of your system could talk to every other part in a language you could
            actually read?
          </blockquote>
          <p>
            The result is a system that is <strong>observable by construction</strong>, replayable by
            design, and composable without ceremony.
          </p>
        </div>
      </section>

      <section id="actors">
        <div className="wide">
          <div className="slabel">The Primitives</div>
          <h2 className="section-title">
            Seven actor types.
            <br />
            One universal interface.
          </h2>
          <div className="agrid">
            <div className="acard">
              <span className="aicon">⬡</span>
              <h3>ModelActor</h3>
              <p>Any LLM, wrapped uniformly. One line to swap providers.</p>
              <ul className="atags">
                <li>Claude</li>
                <li>OpenAI</li>
                <li>Gemini</li>
                <li>Ollama</li>
                <li>OpenRouter</li>
              </ul>
            </div>
            <div className="acard">
              <span className="aicon">▸</span>
              <h3>ProcessActor</h3>
              <p>A persistent shell session as a first-class participant. Any CLI, any subprocess, any REPL.</p>
              <ul className="atags">
                <li>bash / zsh / fish</li>
                <li>Python / Node REPL</li>
                <li>Any binary CLI</li>
                <li>Docker exec</li>
              </ul>
            </div>
            <div className="acard">
              <span className="aicon">⊛</span>
              <h3>MCPActor</h3>
              <p>Speaks the Model Context Protocol natively and auto-discovers tools from any MCP server on connect.</p>
              <ul className="atags">
                <li>stdio servers</li>
                <li>SSE servers</li>
                <li>Auto capability registry</li>
                <li>Claude Code compatible</li>
              </ul>
            </div>
            <div className="acard">
              <span className="aicon">◎</span>
              <h3>ToolActor</h3>
              <p>Deterministic functions and API wrappers. Tools that can also initiate conversations.</p>
              <ul className="atags">
                <li>REST / GraphQL APIs</li>
                <li>Pure functions</li>
                <li>Webhooks</li>
              </ul>
            </div>
            <div className="acard">
              <span className="aicon">◉</span>
              <h3>HumanActor</h3>
              <p>A human is just another actor. Pause any flow, inject a response, resume. Native to the model.</p>
              <ul className="atags">
                <li>stdin / CLI</li>
                <li>WebSocket</li>
                <li>Slack / Webhook</li>
                <li>Nostr later</li>
              </ul>
            </div>
            <div className="acard">
              <span className="aicon">◫</span>
              <h3>MemoryActor</h3>
              <p>Persistent context that participates in conversation. Ask it anything, it responds like an actor.</p>
              <ul className="atags">
                <li>In-memory</li>
                <li>SQLite</li>
                <li>Vector backends</li>
                <li>JSONL files</li>
              </ul>
            </div>
            <div className="acard">
              <span className="aicon">✺</span>
              <h3>Router</h3>
              <p>The runtime. It dispatches, records every hop, and turns the whole run into a readable graph.</p>
              <ul className="atags">
                <li>Recursive dispatch</li>
                <li>Replayable runs</li>
                <li>Forkable history</li>
                <li>Observable by default</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="codesec">
        <div className="container">
          <div className="slabel">Show me the code</div>
          <h2 className="section-title">Same API. Every actor.</h2>
          <div className="cpanel">
            <div className="cbar">
              <div className="dots">
                <div className="dr"></div>
                <div className="dy"></div>
                <div className="dg"></div>
              </div>
              <span className="ctitle">agent.ts</span>
              <span></span>
            </div>
            <pre className="vcode">{`import { Router, ModelActor, ProcessActor, MemoryActor, scriptedModel } from "verbum"

const router = new Router()

router.register(new ModelActor({
  id: "claude",
  provider: "anthropic",
  model: "claude-sonnet",
  adapter: scriptedModel(({ message }) => {
    if (message.from === "user") {
      return {
        from: "claude",
        to: "shell",
        role: "assistant",
        content: { type: "text", text: "npm test --workspace verbum" }
      }
    }

    return "Build is green. Ship it."
  })
}))

router.register(new ProcessActor({ id: "shell" }))
router.register(new MemoryActor({ id: "memory" }))`}</pre>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="slabel">Why it matters</div>
          <h2 className="section-title">
            Four things you get for free
            <br />
            from the right abstraction.
          </h2>
          <div className="wgrid">
            <div className="witem">
              <div className="wnum">01</div>
              <h3>Observable by construction</h3>
              <p>Every interaction, model to shell, agent to MCP server, human to model, is a structured, readable message. Not a log line. Not a trace ID.</p>
            </div>
            <div className="witem">
              <div className="wnum">02</div>
              <h3>Replayable and forkable</h3>
              <p>Replay any run. Fork from any message. Explore what would have happened if the model had responded differently. Debug with time travel.</p>
            </div>
            <div className="witem">
              <div className="wnum">03</div>
              <h3>Portable context</h3>
              <p>Move a conversation between providers mid-flight. Start with Claude, hand off to a local model, resume with GPT. The context belongs to no one.</p>
            </div>
            <div className="witem">
              <div className="wnum">04</div>
              <h3>Composable without ceremony</h3>
              <p>An agent that uses a shell, an MCP server, and a memory store is three registered actors and a routing rule. No pipelines to wire. No abstractions to fight.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="appsec" id="app">
        <div className="wide" style={{ position: "relative", zIndex: 1 }}>
          <div className="slabel">Verbum App · macOS</div>
          <h2>
            The god-view of every
            <br />
            conversation your system is having.
          </h2>
          <p className="lead">
            A native Mac app that ingests streams from Verbum agents, Claude Code, Codex CLI, terminals,
            and custom sources, then renders them as one unified conversation surface.
          </p>
          <div className="afgrid">
            <div className="afcard">
              <span className="aficon">◌</span>
              <h3>Master conversation</h3>
              <p>Your main conversation with Verbum is the master thread. Spawn focused side conversations when you need them.</p>
            </div>
            <div className="afcard">
              <span className="aficon">⌘</span>
              <h3>Claude + Codex companion</h3>
              <p>Claude task files, Codex exec runs, and terminal sessions all stream into the same typed message feed.</p>
            </div>
            <div className="afcard">
              <span className="aficon">#</span>
              <h3>Typed custom sources</h3>
              <p>Bring your own JSONL source and render it beside Claude Code and Codex without inventing a one-off UI.</p>
            </div>
          </div>
          <div className="igrid">
            <div className="icard">
              <div className="iname">Claude Code</div>
              <div className="idesc">Task watcher plus one-off prompt bridge through the local CLI.</div>
              <div className="imode n">Companion</div>
            </div>
            <div className="icard">
              <div className="iname">Codex</div>
              <div className="idesc">Structured `codex exec --json` runs show up as typed messages with usage.</div>
              <div className="imode sub">Companion</div>
            </div>
            <div className="icard">
              <div className="iname">Terminals</div>
              <div className="idesc">Tracked shell sessions let the demo show repo work and machine work side by side.</div>
              <div className="imode s">Replacement</div>
            </div>
            <div className="icard">
              <div className="iname">Custom Source</div>
              <div className="idesc">Emit typed JSONL and Verbum renders it in the same master conversation model.</div>
              <div className="imode ws">Extensible</div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="container">
          <div className="slabel">Get started</div>
          <h2>Stop wiring. Start talking.</h2>
          <p>
            MIT licensed. Built in public. The docs site is static. The Mac app is where the live integrations run.
          </p>
          <div className="ctarow">
            <Link href="/docs" className="btnp">
              Read the docs
            </Link>
            <a href="https://github.com/Bbasche/verbum" className="btns">
              Open GitHub
            </a>
          </div>
        </div>
      </section>

      <footer>
        <div className="finner">
          <div className="wordmark">
            Verbum<span className="wdot"></span>
          </div>
          <div className="flinks">
            <Link href="/docs">Docs</Link>
            <a href="https://github.com/Bbasche/verbum">GitHub</a>
          </div>
          <div className="fmit">MIT licensed · built in public</div>
        </div>
      </footer>
    </>
  );
}
