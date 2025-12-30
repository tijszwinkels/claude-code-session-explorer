# Claude Code Instructions

## Commit Transcripts

On every commit, publish a gist of the conversation transcript and add the preview URL to the commit message:

```bash
uvx claude-code-transcripts json "$(ls -t ~/.claude/projects/<project-directory>/*.jsonl | head -1)" --gist
```

To find your project directory, run: `ls ~/.claude/projects/ | grep $(basename $PWD)`

Add to the commit message footer:
```
transcript: <gistpreview-url>
```

### Safety: DO NOT generate transcript gists if ANY of these conditions apply:
- Transcript contains secrets, API keys, passwords, or tokens
- A `.env` file or any config file containing secrets was read
- Log files were read
- Database queries were executed
- Any other potentially sensitive information was accessed

When in doubt, skip the transcript.
