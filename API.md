# VibeDeck API Reference

Complete reference for all HTTP endpoints, SSE streams, and WebSocket connections exposed by the VibeDeck server.

## Table of Contents

- [Core](#core)
- [Sessions](#sessions)
- [Session Actions](#session-actions)
- [Permissions & Sandbox](#permissions--sandbox)
- [Configuration](#configuration)
- [File Operations](#file-operations)
- [File Watch (SSE)](#file-watch-sse)
- [Diff](#diff)
- [Archives](#archives)
- [Session Statuses](#session-statuses)
- [Terminal](#terminal)
- [SSE Event Stream](#sse-event-stream)

---

## Core

### `GET /`

Serves the main live transcript HTML page.

**Response:** `text/html`

---

### `GET /static/js/{filename}`

Serves JavaScript modules from `templates/static/js/`.

| Param | Type | Description |
|-------|------|-------------|
| `filename` | path, string | JS filename (must end in `.js`, no path separators) |

**Response:** `application/javascript` with `Cache-Control: no-cache`

**Errors:** `404` if not found or invalid filename.

---

### `GET /health`

Health check.

**Response:**
```json
{ "status": "ok", "sessions": 5, "clients": 2 }
```

---

## Sessions

### `GET /sessions`

List all tracked sessions.

**Response:**
```json
{
  "sessions": [
    {
      "id": "abc123",
      "name": "Session Title",
      "path": "/home/user/.claude/projects/-home-user-project/abc123.jsonl",
      "projectName": "MyProject",
      "projectPath": "/home/user/project",
      "firstMessage": "User message...",
      "startedAt": 1234567890,
      "lastUpdatedAt": 1234567890,
      "tokenUsage": {
        "input_tokens": 1000,
        "output_tokens": 500,
        "cache_creation_tokens": 100,
        "cache_read_tokens": 50,
        "message_count": 10,
        "cost": 0.05,
        "models": ["claude-opus-4-6"]
      },
      "backend": "claude-code",
      "summaryTitle": "Implementing auth",
      "summaryShort": "Added login flow...",
      "summaryExecutive": "Detailed summary...",
      "summaryBranch": "feature-auth"
    }
  ]
}
```

---

### `GET /sessions/{session_id}/status`

Get running state and message queue size.

**Response:**
```json
{ "session_id": "abc123", "running": true, "queued_messages": 2 }
```

**Errors:** `404` session not found.

---

### `GET /sessions/{session_id}/messages`

Fetch all rendered messages for a session (lazy loading on tab open).

**Response:**
```json
{
  "session_id": "abc123",
  "html": "<div>...</div>",
  "message_count": 10,
  "first_timestamp": 1234567890,
  "last_timestamp": 1234567899
}
```

**Errors:** `404` session not found.

---

### `GET /sessions/{session_id}/messages/json`

Fetch all messages for a session as normalized, backend-agnostic JSON content blocks.

**Response:**
```json
{
  "session_id": "abc123",
  "messages": [
    {
      "role": "user",
      "timestamp": "2024-12-30T10:00:00.000Z",
      "blocks": [
        { "type": "text", "text": "Hello, Claude!" }
      ]
    },
    {
      "role": "assistant",
      "timestamp": "2024-12-30T10:00:01.000Z",
      "blocks": [
        { "type": "text", "text": "Hello! How can I help?" },
        {
          "type": "tool_use",
          "tool_name": "Write",
          "tool_id": "tool_1",
          "tool_input": { "file_path": "/tmp/hello.py", "content": "print('hello')" }
        }
      ],
      "model": "claude-opus-4-6",
      "stop_reason": "tool_use",
      "usage": {
        "input_tokens": 100,
        "output_tokens": 50,
        "cache_creation_tokens": 0,
        "cache_read_tokens": 0,
        "cost": 0.003
      }
    },
    {
      "role": "user",
      "timestamp": "2024-12-30T10:00:02.000Z",
      "blocks": [
        { "type": "tool_result", "tool_use_id": "tool_1", "content": "", "is_error": false }
      ]
    }
  ],
  "message_count": 3,
  "first_timestamp": "2024-12-30T10:00:00.000Z",
  "last_timestamp": "2024-12-30T10:00:02.000Z"
}
```

Timestamps are in ISO 8601 format. `model`, `stop_reason`, and `usage` are only present on assistant messages.

#### Content block types

All blocks include a `type` field. Other fields are included only when non-null, non-false, non-empty-string, and non-empty-object — **except** `is_error` on `tool_result`, which is always present.

| Type | Fields | Description |
|------|--------|-------------|
| `text` | `text` | Plain text / markdown |
| `thinking` | `text` | Model's internal reasoning |
| `tool_use` | `tool_name`, `tool_id`, `tool_input` | Tool invocation. `tool_input` omitted if empty |
| `tool_result` | `tool_use_id`, `content`, `is_error` | Tool execution result. `is_error` always included |
| `image` | `media_type`, `data` | Base64-encoded image |

**Errors:** `404` session not found.

---

### `GET /sessions/{session_id}/tree`

Get file tree for a session's working directory.

| Param | Type | Description |
|-------|------|-------------|
| `path` | query, string, optional | Absolute path to list. Defaults to session's project path |

**Example:** `GET /sessions/abc123/tree` or `GET /sessions/abc123/tree?path=/home/user/project/src`

**Response:**
```json
{
  "tree": {
    "name": "project",
    "path": "/home/user/project",
    "type": "directory",
    "children": [
      { "name": "src", "path": "/home/user/project/src", "type": "directory", "has_children": true },
      { "name": "README.md", "path": "/home/user/project/README.md", "type": "file" }
    ]
  },
  "home": "/home/user",
  "projectRoot": "/home/user/project"
}
```

Shallow listing. Skips hidden files and common ignored directories (`node_modules`, `venv`, `__pycache__`, etc.). Returns `{ "tree": null, "error": "..." }` if project path is missing.

**Errors:** `404` session not found.

---

## Session Actions

### `POST /sessions/{session_id}/send`

Send a message to a running coding session.

**Request:**
```json
{ "message": "Please implement feature X" }
```

**Response (sent):**
```json
{ "status": "sent", "session_id": "abc123" }
```

**Response (queued — process busy):**
```json
{ "status": "queued", "session_id": "abc123", "queue_position": 2 }
```

**Errors:** `403` send disabled | `404` session not found | `400` empty message | `503` CLI not found.

---

### `POST /sessions/{session_id}/fork`

Fork a session — create a new session that inherits conversation history.

**Request:**
```json
{ "message": "Try a different approach..." }
```

**Response:**
```json
{ "status": "forking", "session_id": "abc123" }
```

**Errors:** `403` fork disabled (needs `--fork` flag) | `404` session not found | `400` empty message | `503` CLI not found | `501` backend doesn't support forking.

---

### `POST /sessions/{session_id}/interrupt`

Interrupt a running CLI process and clear the message queue.

**Response:**
```json
{ "status": "interrupted", "session_id": "abc123" }
```

Attempts graceful termination (2s timeout), then force kills.

**Errors:** `403` send disabled | `404` session not found | `409` no process running.

---

### `POST /sessions/{session_id}/summarize`

Manually trigger summarization for a session.

**Response:**
```json
{ "status": "summarizing", "session_id": "abc123" }
```

Runs in background. Broadcasts `session_summary_updated` SSE event on completion.

**Errors:** `404` session not found | `503` summarization not configured.

---

### `POST /sessions/new`

Start a new session with an initial message.

**Request:**
```json
{
  "message": "Help me build a web app",
  "cwd": "/home/user/project",
  "backend": "claude-code",
  "model_index": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `message` | string, required | Initial prompt |
| `cwd` | string, optional | Working directory (created if missing) |
| `backend` | string, optional | Backend name (default: server's default backend) |
| `model_index` | int, optional | Index into backend's model list |

**Response (started):**
```json
{ "status": "started", "cwd": "/home/user/project" }
```

**Response (permission denied — with permission detection):**
```json
{
  "status": "permission_denied",
  "cwd": "/home/user/project",
  "denials": [{ "tool_name": "Bash", "tool_input": {}, "sandbox_denied_paths": ["/path"] }],
  "original_message": "Help me build a web app",
  "backend": "claude-code",
  "model_index": 0
}
```

**Errors:** `403` send disabled | `400` empty message / invalid backend / invalid model_index / invalid cwd | `503` CLI not found | `500` failed to start.

---

## Permissions & Sandbox

### `POST /sessions/{session_id}/grant-permission`

Grant tool/sandbox permissions and re-send the original message.

**Request:**
```json
{
  "permissions": ["Bash(npm test:*)", "Read"],
  "original_message": "Run the tests"
}
```

Writes permissions to `{project}/.claude/settings.json`, then re-sends the message.

**Response:**
```json
{ "status": "granted", "session_id": "abc123", "permissions": ["Bash(npm test:*)"] }
```

**Errors:** `403` send disabled | `404` session not found | `400` empty message / no project path | `500` failed to write settings | `501` backend doesn't support permissions.

---

### `POST /sessions/grant-permission-new`

Grant permissions and resume a newly created session that hit a permission wall.

**Request:**
```json
{
  "permissions": ["Bash(npm test:*)", "Read"],
  "original_message": "Run the tests",
  "cwd": "/home/user/project",
  "backend": "claude-code",
  "model_index": 0
}
```

Finds the most recently modified session for the given `cwd`, grants permissions, then re-sends the message. Falls back to creating a new session if no matching session found.

**Response:** Same as `POST /sessions/{session_id}/send`.

**Errors:** `403` send disabled | `400` empty message / invalid cwd / cannot grant permissions | `500` failed to write settings.

---

### `POST /allow-directory`

Allow a directory for sandbox access.

**Request:**
```json
{
  "directory": "/home/user/data",
  "add_dirs": ["/home/user/other"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `directory` | string, required | Directory to allow |
| `add_dirs` | string[], optional | Additional existing allowed dirs |

Persists to `~/.config/vibedeck/allowed-dirs.json`.

**Response:**
```json
{ "status": "allowed", "directory": "/home/user/data" }
```

**Errors:** `403` send disabled | `400` empty directory.

---

## Configuration

### `GET /send-enabled`

Check if message sending is enabled.

**Response:**
```json
{ "enabled": true }
```

---

### `GET /fork-enabled`

Check if session forking is enabled.

**Response:**
```json
{ "enabled": true }
```

---

### `GET /default-send-backend`

Get the default backend for new sessions.

**Response:**
```json
{ "backend": "claude-code" }
```

---

### `GET /backends`

List available backends for creating new sessions.

**Response:**
```json
{
  "backends": [
    { "name": "Claude Code", "cli_available": true, "supports_models": false },
    { "name": "OpenCode", "cli_available": true, "supports_models": true }
  ]
}
```

---

### `GET /backends/{backend_name}/models`

List available models for a backend. Case-insensitive name matching.

**Example:** `GET /backends/opencode/models`

**Response:**
```json
{ "models": ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"] }
```

Returns empty list if backend doesn't support model selection.

**Errors:** `404` backend not found.

---

## File Operations

All file routes are under the `/api` prefix.

### `GET /api/file`

Fetch file contents for preview.

| Param | Type | Description |
|-------|------|-------------|
| `path` | query, string, required | Absolute path to file |

**Example:** `GET /api/file?path=/home/user/project/file.py`

**Response:**
```json
{
  "content": "file contents...",
  "path": "/home/user/project/file.py",
  "filename": "file.py",
  "size": 1024,
  "language": "python",
  "truncated": false,
  "rendered_html": null
}
```

For markdown files, `rendered_html` contains sanitized HTML. Files > 1MB are truncated. Binary files (null bytes in first 8KB) are rejected.

**Errors:** `403` outside allowed dirs | `404` not found | `400` not a file or binary | `500` read error.

---

### `GET /api/file/raw`

Serve raw file bytes (images, audio).

| Param | Type | Description |
|-------|------|-------------|
| `path` | query, string, required | Absolute path to file |

**Example:** `GET /api/file/raw?path=/home/user/project/logo.png`

**Response:** Raw bytes with appropriate MIME type and `Cache-Control: private, max-age=3600`.

Supported: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.ico`, `.bmp`, `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, `.aac`, `.wma`, `.webm`.

**Errors:** `403` | `404` | `400` not a file | `500` read error.

---

### `GET /api/file/download`

Download a file with `Content-Disposition: attachment`.

| Param | Type | Description |
|-------|------|-------------|
| `path` | query, string, required | Absolute path to file |

**Example:** `GET /api/file/download?path=/home/user/project/report.pdf`

**Response:** Raw bytes with `Content-Disposition: attachment; filename="report.pdf"`.

**Errors:** `403` | `404` | `400` | `500`.

---

### `POST /api/file/upload`

Upload a file.

| Param | Type | Description |
|-------|------|-------------|
| `directory` | query, string, required | Target directory path |
| `filename` | query, string, required | Name for the uploaded file |

**Body:** Raw file bytes.

**Example:** `POST /api/file/upload?directory=/home/user/project&filename=uploaded.txt`

**Response:**
```json
{ "success": true, "path": "/home/user/project/uploaded.txt", "error": null }
```

Filename is sanitized to prevent path traversal.

**Errors:** Returns `{ "success": false, "error": "..." }` on failure.

---

### `POST /api/file/delete`

Delete a file or empty directory.

**Request:**
```json
{ "path": "/home/user/project/temp.txt", "confirm": true }
```

**Response:**
```json
{ "success": true, "error": null }
```

Only deletes empty directories. Requires path within allowed directories.

---

### `GET /api/path/type`

Check whether a path is a file or directory.

| Param | Type | Description |
|-------|------|-------------|
| `path` | query, string, required | Absolute path (supports `~`) |

**Example:** `GET /api/path/type?path=~/project/src`

**Response:**
```json
{ "type": "file" }
```
or
```json
{ "type": "directory" }
```

**Errors:** `404` not found or outside allowed dirs.

---

### `GET /api/path/resolve`

Resolve a path, expanding `~` and relative components.

| Param | Type | Description |
|-------|------|-------------|
| `path` | query, string, required | Path to resolve |
| `session_id` | query, string, optional | Session ID for resolving relative paths against project root |

**Example:** `GET /api/path/resolve?path=~/project/src/main.py`

**Response:**
```json
{ "resolved": "/home/user/project/src/main.py" }
```

**Example (relative path with session):** `GET /api/path/resolve?path=src/main.py&session_id=abc123`

**Response:**
```json
{ "resolved": "/home/user/project/src/main.py" }
```

**Errors:** `404` not found, outside allowed dirs, or cannot resolve relative path.

---

## File Watch (SSE)

### `GET /api/file/watch`

SSE stream for live file updates (tail-style).

| Param | Type | Description |
|-------|------|-------------|
| `path` | query, string, required | Absolute path to file |
| `follow` | query, bool, optional | Default `true`. When true, detects appends and sends only new bytes. When false, sends full content on change. |

**Events:**

| Event | Description | Data |
|-------|-------------|------|
| `initial` | Full content on connect | `{ "content": "...", "size": 1024, "inode": 12345, "truncated": false }` |
| `append` | New bytes appended (follow=true) | `{ "content": "new line\n", "offset": 1024 }` |
| `replace` | Full content (truncation, rewrite, inode change) | `{ "content": "...", "size": 2048, "inode": 12345, "truncated": false }` |
| `changed` | File changed notification (follow=false) | `{ "size": 2048, "inode": 12345 }` |
| `error` | File deleted, permission error, etc. | `{ "message": "File was deleted" }` |

Polls at 100ms debounce. Streams until client disconnects.

**Errors:** `403` | `404` | `400` not a file.

---

## Diff

All diff routes are under `/api/diff`.

### `GET /api/diff/session/{session_id}/files`

List changed files for a session's project.

| Param | Type | Description |
|-------|------|-------------|
| `session_id` | path, string | Session ID |
| `cwd` | query, string, optional | Working directory override (e.g. worktrees) |

**Example:** `GET /api/diff/session/abc123/files` or `GET /api/diff/session/abc123/files?cwd=/home/user/worktree`

**Response:**
```json
{
  "files": [
    { "path": "src/main.py", "additions": 10, "deletions": 5, "status": "modified" }
  ],
  "diff_type": "uncommitted",
  "main_branch": "main",
  "current_branch": "feature-x",
  "cwd": "/home/user/project",
  "uncommitted_files": [],
  "branch_files": []
}
```

| Field | Values |
|-------|--------|
| `status` | `staged`, `modified`, `untracked`, `committed` |
| `diff_type` | `uncommitted`, `vs_main`, `no_git` |

Always returns both `uncommitted_files` and `branch_files` when available. Skips binary untracked files. Estimates line count for large (>1MB) untracked files.

**Errors:** `404` session not found or path doesn't exist | `403` git root outside home.

---

### `GET /api/diff/session/{session_id}/file`

Get diff content for a specific file.

| Param | Type | Description |
|-------|------|-------------|
| `session_id` | path, string | Session ID |
| `path` | query, string, required | Relative path within project |
| `cwd` | query, string, optional | Working directory override |

**Example:** `GET /api/diff/session/abc123/file?path=src/main.py`

**Response:**
```json
{
  "diff": "diff --git a/src/main.py b/src/main.py\n...",
  "file_path": "/home/user/project/src/main.py",
  "status": "modified"
}
```

For untracked files, creates a pseudo-diff showing all lines as additions. For files with both staged and unstaged changes, combines both diffs.

| `status` | `staged`, `modified`, `untracked`, `committed`, `unchanged` |
|-----------|--------------------------------------------------------------|

**Errors:** `404` session/project not found | `400` not a git repo.

---

## Archives

All archive routes are under `/api`.

### `GET /api/archived-sessions`

**Response:**
```json
{ "archived": ["session1", "session2"] }
```

Stored in `~/.config/vibedeck/archived-sessions.json`.

---

### `POST /api/archived-sessions/archive`

**Request:**
```json
{ "session_id": "abc123" }
```

**Response:**
```json
{ "status": "archived", "session_id": "abc123" }
```
or `{ "status": "already_archived", ... }`.

---

### `POST /api/archived-sessions/unarchive`

**Request:**
```json
{ "session_id": "abc123" }
```

**Response:**
```json
{ "status": "unarchived", "session_id": "abc123" }
```
or `{ "status": "not_archived", ... }`.

---

### `GET /api/archived-projects`

**Response:**
```json
{ "archived_projects": ["/home/user/project1"] }
```

Stored in `~/.config/vibedeck/archived-projects.json`.

---

### `POST /api/archived-projects/archive`

**Request:**
```json
{ "project_path": "/home/user/project" }
```

**Response:**
```json
{ "status": "archived", "project_path": "/home/user/project" }
```
or `{ "status": "already_archived", ... }`.

---

### `POST /api/archived-projects/unarchive`

**Request:**
```json
{ "project_path": "/home/user/project" }
```

**Response:**
```json
{ "status": "unarchived", "project_path": "/home/user/project" }
```
or `{ "status": "not_archived", ... }`.

---

## Session Statuses

### `GET /api/session-statuses`

**Response:**
```json
{ "statuses": { "session1": "done", "session2": "in_progress", "session3": "waiting" } }
```

Stored in `~/.config/vibedeck/session-statuses.json`.

---

### `POST /api/session-statuses/set`

**Request:**
```json
{ "session_id": "abc123", "status": "done" }
```

Valid statuses: `null` (clear), `"in_progress"`, `"waiting"`, `"done"`.

**Response:**
```json
{ "status": "updated", "session_id": "abc123", "new_status": "done" }
```

**Errors:** `400` invalid status | `500` save failed.

---

## Terminal

### `GET /api/terminal/enabled`

**Response:**
```json
{ "enabled": true }
```

Returns `false` if `ptyprocess` is not installed or `--disable-terminal` flag is set.

---

### `GET /api/terminal/shells`

**Response:**
```json
{ "shells": ["/bin/bash", "/bin/zsh", "/bin/sh"], "default": "/bin/bash" }
```

**Errors:** `403` terminal disabled.

---

### `WebSocket /ws/terminal`

Interactive terminal via WebSocket.

| Param | Type | Description |
|-------|------|-------------|
| `cwd` | query, string, optional | Working directory |

**Example:** `ws://localhost:8090/ws/terminal?cwd=/home/user/project`

**Protocol:**
- **Client -> Server:** Raw terminal input (keystrokes, paste) as text frames.
- **Server -> Client:** Raw terminal output as text frames.
- **Client -> Server (JSON):** Resize events:
  ```json
  { "type": "resize", "cols": 80, "rows": 24 }
  ```

Creates a PTY on the server. **Close code `4003`** if terminal is disabled.

---

## SSE Event Stream

### `GET /events`

Server-Sent Events stream for all real-time updates (HTML format). Streams indefinitely until client disconnects.

**Events:**

| Event | When | Data |
|-------|------|------|
| `sessions` | On connect | `{ "sessions": [...], "maxSessions": 20 }` |
| `catchup_complete` | After initial session list | `{}` |
| `session_added` | New session discovered | Session object (see shape below) |
| `session_removed` | Session evicted (LRU) | `{ "id": "..." }` |
| `message` | New message in any session | `{ "type": "html", "content": "<div>...</div>", "session_id": "..." }` |
| `session_catchup` | Full history loaded (per-message) | `{ "type": "html", "content": "<div>...</div>", "session_id": "..." }` |
| `session_status` | Process state changed | `{ "session_id": "...", "running": true, "queued_messages": 0, "waiting_for_input": false }` |
| `session_token_usage_updated` | Token count changed | `{ "session_id": "...", "tokenUsage": {...} }` |
| `session_summary_updated` | Summary regenerated | `{ "session_id": "...", "summaryTitle": "...", "summaryShort": "...", "summaryExecutive": "..." }` |
| `permission_denied` | Permission prompt needed | `{ "session_id": "...", "denials": [...], "original_message": "..." }` |
| `ping` | Every 30s | `{}` |

> **Note:** The HTML `message` and `session_catchup` events use `{ "type": "html", "content": "..." }` format. The `session_catchup` event is sent as individual `message` events per message (not batched). The `session_added` event sends the session object directly as the data (not wrapped in `{"session": ...}`).

---

### `GET /events/json`

Server-Sent Events stream with structured JSON content blocks instead of rendered HTML. Designed for custom GUI clients and programmatic consumers. Streams indefinitely until client disconnects.

All non-message events (`session_added`, `session_removed`, `session_status`, `session_summary_updated`, `session_token_usage_updated`, `permission_denied`, `ping`) use the same payload as `GET /events`. The `sessions` event on connect also uses the same format.

**Message-specific events:**

| Event | When | Data |
|-------|------|------|
| `sessions` | On connect | `{ "sessions": [...], "maxSessions": 20 }` |
| `message` | New message in any session | `{ "session_id": "...", "message": { NormalizedMessage } }` |
| `session_catchup` | Full history loaded | `{ "session_id": "...", "messages": [ { NormalizedMessage }, ... ] }` |

**NormalizedMessage shape:**

```json
{
  "role": "assistant",
  "timestamp": "2024-12-30T10:00:01.000Z",
  "blocks": [
    { "type": "text", "text": "Hello!" },
    { "type": "tool_use", "tool_name": "Write", "tool_id": "tool_1", "tool_input": { "file_path": "/tmp/hello.py" } }
  ],
  "model": "claude-opus-4-6",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50,
    "cache_creation_tokens": 0,
    "cache_read_tokens": 0,
    "cost": 0.003
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | `"user"` or `"assistant"` |
| `timestamp` | string | ISO 8601 (e.g., `2024-12-30T10:00:01.000Z`) |
| `blocks` | ContentBlock[] | Content blocks (see type reference below) |
| `model` | string, optional | Model ID. Omitted for user messages |
| `stop_reason` | string, optional | `"end_turn"`, `"tool_use"`, `"max_tokens"`, or omitted |
| `usage` | object, optional | Token usage for this message. Omitted for user messages |

See `GET /sessions/{session_id}/messages/json` for content block type reference.

Normalization only runs when JSON clients are connected (lazy evaluation).

### Session object shape

Used in `GET /sessions`, `session_added` SSE event, and the `sessions` SSE event on connect.

```json
{
  "id": "abc123",
  "name": "Session Title",
  "path": "/home/user/.claude/projects/-home-user-project/abc123.jsonl",
  "projectName": "MyProject",
  "projectPath": "/home/user/project",
  "firstMessage": "User's first message...",
  "startedAt": 1234567890,
  "lastUpdatedAt": 1234567890,
  "tokenUsage": {
    "input_tokens": 1000,
    "output_tokens": 500,
    "cache_creation_tokens": 100,
    "cache_read_tokens": 50,
    "message_count": 10,
    "cost": 0.05,
    "models": ["claude-opus-4-6"]
  },
  "backend": "claude-code",
  "summaryTitle": "Implementing auth",
  "summaryShort": "Added login flow...",
  "summaryExecutive": "Detailed summary...",
  "summaryBranch": "feature-auth"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Session ID |
| `name` | string | Session display name |
| `path` | string | Path to session JSONL file |
| `projectName` | string | Project name (derived from path) |
| `projectPath` | string | Absolute path to the project directory |
| `firstMessage` | string | First user message in the session |
| `startedAt` | number \| null | Unix timestamp of first message |
| `lastUpdatedAt` | number \| null | Unix timestamp of last message |
| `tokenUsage` | object | Token usage stats (see below) |
| `backend` | string | Backend name (`"claude-code"`, `"opencode"`) |
| `summaryTitle` | string \| null | AI-generated session title |
| `summaryShort` | string \| null | Short summary |
| `summaryExecutive` | string \| null | Detailed executive summary |
| `summaryBranch` | string \| null | Git branch name |

**TokenUsage object:**

| Field | Type | Description |
|-------|------|-------------|
| `input_tokens` | int | Total input tokens |
| `output_tokens` | int | Total output tokens |
| `cache_creation_tokens` | int | Cache creation tokens |
| `cache_read_tokens` | int | Cache read tokens |
| `message_count` | int | Number of messages |
| `cost` | float | Estimated cost in USD |
| `models` | string[] | Model IDs used in session |

---

## Security

- **File access:** All file operations restricted to `~` and `/tmp`. Path traversal is blocked.
- **Git operations:** Git root must be within home directory. 30s timeout on all git commands.
- **Allowed directories:** Configurable via `~/.config/vibedeck/allowed-dirs.json` and the `/allow-directory` endpoint.
- **Permissions:** Written to `{project}/.claude/settings.json`. Supports tool permissions and sandbox directory permissions.
- **Binary detection:** Null bytes in first 8KB rejects file reads.
- **Terminal:** PTY access can be disabled with `--disable-terminal`.

## Persistent State Files

| File | Purpose |
|------|---------|
| `~/.config/vibedeck/allowed-dirs.json` | Sandbox-allowed directories |
| `~/.config/vibedeck/archived-sessions.json` | Archived session IDs |
| `~/.config/vibedeck/archived-projects.json` | Archived project paths |
| `~/.config/vibedeck/session-statuses.json` | Session status markers |
