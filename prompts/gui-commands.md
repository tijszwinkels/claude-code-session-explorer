# VibeDeck GUI Commands

VibeDeck supports special command blocks that allow LLMs to control the GUI during a conversation. Commands are embedded in markdown code blocks with the `vibedeck` language tag.

## Command Syntax

Commands use XML-like syntax inside a fenced code block:

~~~markdown
```vibedeck
<openFile path="~/project/src/main.py" />
```
~~~

## Available Commands

### openFile

Opens a file in the VibeDeck preview pane.

**Attributes:**
- `path` (required): File path. Supports:
  - Absolute paths: `/home/user/file.txt`
  - Home-relative paths: `~/file.txt`
  - Relative paths: `src/main.py` (resolved against the session's project directory)
- `line` (optional): Line number to scroll to (1-indexed)
- `follow` (optional): Set to `"true"` to enable follow mode (auto-scroll on file changes)

**Examples:**

```vibedeck
<openFile path="src/components/Button.tsx" />
```

```vibedeck
<openFile path="~/project/logs/app.log" follow="true" />
```

```vibedeck
<openFile path="/home/user/project/src/main.py" line="42" />
```

### openUrl

Opens a URL in a sandboxed iframe in the preview pane.

**Attributes:**
- `url` (required): URL to display. Must be `http://` or `https://`.

**Example:**

```vibedeck
<openUrl url="http://localhost:3000" />
```

## Security Notes

- File paths are restricted to the user's home directory
- URLs are displayed in a sandboxed iframe with restricted permissions
- Local HTML files are sandboxed without `allow-same-origin` to prevent access to VibeDeck's storage

## Integration

Add this file as a prompt include in your CLAUDE.md or system prompt to enable GUI command support:

```markdown
@prompts/gui-commands.md
```
