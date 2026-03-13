# Verbum Launch Demo

## Goal

Make the audience feel one idea viscerally: Claude Code, Codex, your terminals, memory, and you are all in one observable conversation.

## Setup

- Native app on the main display
- Claude Code in one terminal
- Codex in a second terminal or managed by the app
- A third terminal for a plain shell task
- Repo already open with one small failing test and one obvious fix path

## The 2-minute cut

### Before you hit record

- open the Mac app and make sure `Master conversation` is visible
- have Claude Code already authenticated locally
- have Codex already authenticated locally
- keep the repo at a clean point where `npm test --workspace packages/verbum` is green
- if possible, leave one recent Claude task in `~/.claude/tasks` so the watcher has something to show

### 1. Open with the punchline

Say:

> "Most agent tooling hides the interesting part. Verbum makes the whole machine talk in public."

Visual:

- Start on the native app graph
- Claude Code, Codex, `zsh`, machine shell, Search, and Inbox are already visible as nodes
- The message bus is moving before you touch anything

### 2. Give the task

In the app inbox, send:

> "Explain why Verbum is easier to debug than ad-hoc tool glue, then give me one launch-ready TypeScript snippet."

Visual:

- The Inbox node lights up
- A new edge fires to Verbum App
- Verbum App fans the request out to Claude Code or Codex depending on route

### 3. Show orchestration, not chat

Say:

> "Claude is answering. Codex is answering. The shell is running the suite. And I can see all of it in one place."

Visual:

- Run the app's `Run 2-minute demo` button
- Codex returns a structured answer in the message feed
- Claude Code returns a launch-ready explanation with a code block
- `zsh · repo` runs `npm test --workspace packages/verbum`
- `zsh · machine` shows a few `~/.claude/tasks` files so the companion story feels real

### 4. Land the search moment

In the native app search, ask:

> "What pattern are we using here?"

Expected answer:

> "Claude Code is responsible for the patch, Codex is the verifier, terminals are the execution layer, and the human interrupt stays in the inbox."

Say:

> "The graph is not just pretty. It becomes memory."

### 5. Close with the product thesis

Say:

> "This is Verbum. The website tells the story. The Mac app runs the story."

Visual:

- Zoom out to show the full graph again
- Leave the message bus and inbox visible
- End with the repo URL and `npm install https://github.com/Bbasche/verbum-ai/releases/latest/download/verbum-ai-0.1.0.tgz`

## Recording notes

- Keep terminal fonts large enough to read in an autoplaying X clip
- Do not show empty waiting states
- Script the task so the edges fire immediately
- End before the audience has time to think "dashboard"

## Strong demo tasks

- Ask Codex for a sharp three-bullet architectural explanation
- Ask Claude Code for a launch-ready explanation plus one code block
- Run `npm test --workspace packages/verbum` in the repo shell
- Run `find ~/.claude/tasks -maxdepth 2 -type f | head -n 6` in the machine shell
- Run `find packages/verbum/src -maxdepth 2 -type f | sort` to show the code surface quickly
- If you want one extra flex: start a custom JSONL source and let it appear in the same feed

## Best terminal moments

- `npm test --workspace packages/verbum`
- `find packages/verbum/src -maxdepth 2 -type f | sort`
- `find ~/.claude/tasks -maxdepth 2 -type f | head -n 6`
- `git status --short`
- `npm run build --workspace @verbum/mac`
