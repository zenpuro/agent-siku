# pstack (agent-agnostic port)

A portable port of the [pstack](https://github.com/cursor/plugins/tree/main/pstack) skill collection by Lauren Tan, plus three skills from [cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit). The originals target Cursor; this port removes Cursor-specific mechanics so the skills work in any coding agent (Claude Code, pi, zcode, and others).

Source versions at port time: pstack **0.15.44**, cursor-team-kit **1.2.0**.

## What changed in the port

- Cursor tool names (`Task`, `AskQuestion`, todolist tool, `subagent_type` fields) became agent-neutral instructions.
- Cursor model slugs and the `setup-pstack` / `pstack-models.mdc` configuration mechanism were removed. Model choice is expressed as capability tiers ("strongest reasoning model", "fast, cheap model") with a one-line fallback for agents that cannot pick a model per subagent.
- Session-transcript reads point to `poteto-mode/transcripts.md`, which lists where Claude Code and pi store transcripts; other agents ask the user.
- Runtime-generated skills are written to the current agent's skills directory (`.agents/skills/` by default, `.claude/skills/` in Claude Code).
- Cursor-only features were replaced with generic equivalents (`/loop` → repeat-until, cloud agents → local worktree subagents, `origin` → `gh`, embedded video → file path) or removed.
- The `poteto-agent` and `comment-sicko` agent definitions were inlined into `poteto-mode` and `no-comments` respectively. `poteto-mode/worker.md` remains the shared operator-rules file for subagents.
- The `watch-pr` scripts keep their full `gh`-driven core; the Bugbot annotation layer was stripped. `references/review-bot-triage.md` generalizes the old Bugbot triage rubric to any review bot.
- References to Cursor's built-in `create-skill` now point to the `writing-for-agents` skill in this repository.

## What was not ported

- `make-bot-ui` — its entire flow is the Cursor Automations feature.
- `setup-pstack` — replaced by inline capability-tier guidance (see above).
- The remaining cursor-team-kit skills beyond `deslop`, `control-ui`, `control-cli`.

## Install notes

Install with `siku install` (or your agent's skill installer). All skills keep their original names. `tdd` and `teach` share names with other skills in this repository; the installer resolves same-name conflicts by selection order, so pick the variant you want.

## License

MIT. Original works:

- pstack: Copyright (c) 2026 Lauren Tan
- cursor-team-kit: Copyright (c) 2026 Cursor

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.