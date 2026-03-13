# Launch Checklist

## Product

- Ship the core `verbum-ai` package
- Ship the static docs/marketing site
- Ship the native macOS app
- Keep collaboration and P2P clearly marked as roadmap

## Repo

- Push to GitHub
- Add the repo description and social preview
- Turn on Discussions or a Discord link if you want contributor energy fast
- Add `good first issue` labels after launch

## Package

- Verify `npm run build --workspace packages/verbum`
- Verify `npm test --workspace packages/verbum`
- Publish with `npm publish --workspace packages/verbum --access public`

## Site

- Point Vercel at `apps/web`
- Add the production domain
- Make sure the docs page and app overview page both build cleanly

## Native app

- Run `npm run dev --workspace @verbum/mac`
- Record the graph, inbox, terminals, and search flowing together
- Capture one polished screenshot for the README and tweet

## Launch

- Post the announcement clip on X
- Immediately reply with the repo link, docs link, and `npm install https://github.com/Bbasche/verbum-ai/releases/latest/download/verbum-ai-0.1.0.tgz`
- Submit Show HN with the same clip and a short honest explanation
- Stay online for the first two hours and answer comments fast
