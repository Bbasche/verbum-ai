import Link from "next/link";

export default function DocsPage() {
  return (
    <>
      <header>
        <div className="hinner">
          <Link href="/" className="wordmark">
            <img alt="Verbum" className="wordmark-image" src="/brand/verbum-logo-light.png" />
          </Link>
          <nav>
            <Link href="/">Home</Link>
            <a href="https://github.com/Bbasche/verbum-ai" className="ncta">
              GitHub →
            </a>
          </nav>
        </div>
      </header>

      <section className="docs-hero">
        <div className="container">
          <p className="hlabel">Docs</p>
          <h1>
            Build with the framework.
            <br />
            Run the Mac app.
          </h1>
          <p className="hsub">
            The website is static. The package and the Mac app do the real work.
          </p>
          <div className="hact">
            <a href="/download/mac" className="btnp">
              Download for macOS
            </a>
            <a href="https://www.npmjs.com/package/verbum-ai" className="btns">
              View npm package
            </a>
          </div>
        </div>
      </section>

      <section>
        <div className="container docs-shell">
          <article className="doc-block">
            <div className="slabel">Download</div>
            <pre className="vcode">{`# Mac app
open https://verbum-ai.vercel.app/download/mac

# if macOS blocks Verbum after you move it to Applications
xattr -dr com.apple.quarantine /Applications/Verbum.app
open /Applications/Verbum.app

# Framework package
npm install verbum-ai`}</pre>
          </article>

          <article className="doc-block">
            <div className="slabel">Install</div>
            <pre className="vcode">{`git clone https://github.com/Bbasche/verbum-ai.git
cd verbum
npm install

npm run dev --workspace @verbum/mac`}</pre>
          </article>

          <article className="doc-block">
            <div className="slabel">What You Get</div>
            <ul className="doc-list">
              <li>The `verbum` TypeScript package with Router and built-in actors.</li>
              <li>A native Mac app that watches Claude Code, Codex, and local terminal sessions.</li>
              <li>A master conversation model with optional spawned side conversations.</li>
              <li>Setup docs, demo docs, CI, and release scaffolding.</li>
            </ul>
          </article>

          <article className="doc-block">
            <div className="slabel">Mac App Setup</div>
            <pre className="vcode">{`# optional local config
cp verbum.app.config.example.json verbum.app.config.json

# run the app
npm run dev --workspace @verbum/mac

# the app can:
# - watch ~/.claude/tasks
# - prompt claude
# - run codex exec --json
# - run tracked terminal commands`}</pre>
          </article>

          <article className="doc-block">
            <div className="slabel">Notes</div>
            <p className="doc-copy">
              Use the package to build with Verbum and the Mac app to run it as a desktop companion for
              Claude Code, Codex, terminals, and custom sources.
            </p>
            <p className="doc-copy">
              The current DMG is usable for testers, but the frictionless install path is still waiting
              on Apple signing keys for full signing and notarization.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
