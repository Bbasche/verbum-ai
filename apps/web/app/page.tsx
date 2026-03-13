import Link from "next/link";

import { MessageBus } from "../components/MessageBus";
import { actorCards, docSections, launchSurfaces, launchChecklist, quickstartCode } from "../lib/content";

export default function HomePage() {
  return (
    <div className="page-stack">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Open source · TypeScript · MIT</span>
          <h1>Everything is a conversation.</h1>
          <p className="hero-lead">
            Verbum gives Claude Code, Codex, terminals, tools, memory, and humans one shared language:
            messages. The result is an orchestration layer you can actually see.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/docs">
              Read the docs
            </Link>
            <Link className="button button-secondary" href="/graph">
              View the Mac app
            </Link>
          </div>
        </div>
        <div className="hero-card">
          <span className="eyebrow">Launch Readiness</span>
          <ul className="metric-list">
            <li>
              <strong>1 repo</strong>
              <span>Package, site, docs, and launch assets together</span>
            </li>
            <li>
              <strong>7 actors</strong>
              <span>Models, terminals, tools, memory, humans, and the router</span>
            </li>
            <li>
              <strong>0 hidden glue</strong>
              <span>Every interesting system event becomes a message in the graph</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="panel-grid">
        {launchSurfaces.map((surface) => (
          <article className="panel" key={surface.title}>
            <span className="eyebrow">Ship Surface</span>
            <h2>{surface.title}</h2>
            <p>{surface.copy}</p>
          </article>
        ))}
      </section>

      <MessageBus />

      <section className="panel">
        <div className="section-heading">
          <span className="eyebrow">Core Primitives</span>
          <h2>Actors that already feel composable.</h2>
        </div>
        <div className="actor-grid">
          {actorCards.map((actor) => (
            <article className={`actor-card actor-${actor.accent}`} key={actor.name}>
              <h3>{actor.name}</h3>
              <p>{actor.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel panel-code">
        <div className="section-heading">
          <span className="eyebrow">Quickstart</span>
          <h2>Five minutes from install to orchestration.</h2>
        </div>
        <pre>
          <code>{quickstartCode}</code>
        </pre>
      </section>

      <section className="panel-grid">
        {docSections.map((section) => (
          <article className="panel" key={section.title}>
            <span className="eyebrow">Launch Narrative</span>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="section-heading">
          <span className="eyebrow">Launch Weekend</span>
          <h2>The checklist that keeps us honest.</h2>
        </div>
        <ol className="checklist">
          {launchChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
