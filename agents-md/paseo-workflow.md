## Paseo Orchestration Notes

- When Paseo MCP orchestration tools are available, use Paseo to dispatch subagents or worktrees; before each dispatch, call `list_profiles` and pick the profile that best fits the task. If no profile fits, state the fallback combination and rationale to the user first.
