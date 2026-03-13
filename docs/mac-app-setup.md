# Mac App Setup

## What the Mac app does

The website is static marketing and docs only.

The Mac app is the live client:

- watches Claude task files from `~/.claude/tasks`
- sends one-off prompts to Claude Code through the `claude` CLI
- sends one-off prompts to Codex through `codex exec --json`
- runs terminal commands in tracked shell sessions
- renders all of those as typed messages in the same feed

## Install

```bash
git clone https://github.com/Bbasche/verbum.git
cd verbum
npm install
```

## Start the app

```bash
npm run dev --workspace @verbum/mac
```

## Clean local setup

1. Make sure `claude` is installed and authenticated.
2. Make sure `codex` is installed and authenticated.
3. Keep your main working repo checked out locally.
4. Optionally copy `verbum.app.config.example.json` to `verbum.app.config.json` and set `workspaceRoot`.

## Optional config

Verbum looks for config in:

- `./verbum.app.config.json`
- `~/.config/verbum/app.json`

Example:

```json
{
  "workspaceRoot": "/Users/you/projects/verbum",
  "customSources": [
    {
      "id": "custom-source",
      "name": "Custom Source",
      "command": "node",
      "args": ["./apps/mac/examples/custom-source.js"],
      "cwd": "/Users/you/projects/verbum",
      "autostart": false
    }
  ]
}
```

## What to expect on first launch

- `Master conversation` appears immediately as your primary thread with Verbum
- Claude and Codex show as connected if their CLIs are installed
- Claude task file updates appear automatically if `~/.claude/tasks` exists
- Terminal sessions for the repo and the machine are ready for demo commands

