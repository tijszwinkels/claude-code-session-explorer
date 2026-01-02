# claude-code-live

Live-updating transcript viewer for Claude Code sessions.

## Overview

This tool provides real-time updates as your Claude Code session progresses. New messages appear automatically within ~1 second.

## Installation

```bash
uv tool install git+https://github.com/tijszwinkels/claude-code-live
```

Or run directly:

```bash
uvx git+https://github.com/tijszwinkels/claude-code-live
```

## Usage

```bash
# Watch all recent sessions (auto-detected, up to 10)
claude-code-live

# Watch a specific session file (in addition to auto-discovered ones)
claude-code-live --session ~/.claude/projects/.../session.jsonl

# Limit number of sessions
claude-code-live --max-sessions 5

# Custom port
claude-code-live --port 8765

# Don't auto-open browser
claude-code-live --no-open
```

## Features

- **Multi-session tabs** - View multiple Claude Code sessions in a tabbed interface
- **Auto-follow** - Automatically switches to the tab with new activity (optional)
- **Live updates** - New messages appear automatically via Server-Sent Events
- **Auto-scroll** - Follows new messages when you're at the bottom
- **Resource-conscious** - Limits DOM nodes to prevent memory issues
- **Session discovery** - Automatically finds recent sessions in ~/.claude/projects/
- **Same styling** - Uses the same CSS as claude-code-transcripts

## Development

```bash
# Install dependencies
uv sync

# Run tests
uv run pytest

# Run development server
uv run claude-code-live --debug
```

## Credits

This project is based on [claude-code-transcripts](https://github.com/simonw/claude-code-transcripts) by [Simon Willison](https://simonwillison.net/). This project allows to generate html-pages from claude code transcripts, put those in gists, and attach them to commit logs, which is tremendously useful. The HTML rendering, CSS styling, and message formatting are adapted from that project.

This is an adaptation that allows to view the transcripts in a browser while claude is working. It's more readable than the claude code output itself, so I keep this open in a second screen while I'm working, so I can easily keep track of what the coding agent is doing.

## License

Apache 2.0
