# Transcript sources

Where each agent stores session transcripts. A transcript is the append-only log of a session: user messages, tool calls, and results. Formats differ between agents, so extract by meaning (user decisions, corrections, recurring preferences, tool outcomes), not by field names.

## Claude Code

`~/.claude/projects/<slug>/<session-uuid>.jsonl`

- `<slug>` is the workspace path with every non-alphanumeric character replaced by `-` (dots included). `D:\repo\proj` becomes `D--repo-proj`.
- The newest `.jsonl` directly in that folder is the current session.
- A `<session-uuid>/subagents/` folder beside the file holds subagent transcripts.
- Read only the current workspace's folder unless the task explicitly asks for cross-project history.

## pi

`~/.pi/agent/sessions/<slug>/<timestamp>_<session-uuid>.jsonl`

- `<slug>` is the working directory with `/`, `\`, and `:` replaced by `-`, wrapped in leading and trailing `--`. Dots are kept. `C:\Users\you\proj` becomes `--C--Users-you-proj--`.
- Files are named with an ISO timestamp (`:` and `.` replaced by `-`) followed by `_` and the session UUID. The newest file is the current session.

## Other agents

Ask the user where the agent stores session transcripts. Do not guess paths.