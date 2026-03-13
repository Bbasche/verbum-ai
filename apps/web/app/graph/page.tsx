import { GraphPreview } from "../../components/GraphPreview";

export default function GraphPage() {
  return (
    <div className="page-stack">
      <section className="panel intro-panel">
        <span className="eyebrow">Verbum App</span>
        <h1>The Mac app brings graph, search, inbox, and terminals together.</h1>
        <p>
          This page is a static product overview only. The docs site does not connect to local tools,
          sessions, or sources. Live graphing, search, routing, and source bridges live only in the Mac
          app.
        </p>
      </section>
      <GraphPreview />
    </div>
  );
}
