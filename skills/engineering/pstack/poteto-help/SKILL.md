---
name: poteto-help
description: Guides users through pstack setup, /poteto-mode, and picking the skill, playbook, or principle for a task. Type /poteto-help with a question.
disable-model-invocation: true
metadata:
  credits:
    skill: poteto-help
    author: Lauren Tan
    organisation: Cursor
    url: "https://github.com/cursor/plugins/tree/main/pstack/skills/poteto-help"
---

# Poteto help

Answer the user's question about pstack, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a pstack run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use pstack to fix this bug", is not a help question. Read the **poteto-mode** skill (read its SKILL.md from your installed skills directory) and do the work under it.

This file maps questions to the skills and guide pages that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. Skills live in your installed skills directory; locate them by name. When the user needs a link to a file, give its public copy: `https://github.com/cursor/plugins/blob/main/pstack/` followed by its path.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with `/poteto-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make pstack my own

Check the state that changes the answer, and mention it only when it does:

- No `verify-*` skill or other app harness in the project means agents have no scripted way to drive the app. Mention `/create-verification-skill` when the question is about proving a change works.
- No formal verification skill in the project means no property is checked past what tests reach. Mention `/create-formal-verification-skill` when the question is about a race, an invariant, or another case tests rarely hit. When one exists and the code it covers changed after the commit it records as last in sync, mention `/maintain-formal-verification-skill` if the question touches that code.

## Get set up

1. Install with your agent's skill installer.
2. Start a real task with `/poteto-mode`, a goal, and a check that can pass or fail.

Installing changes nothing until the user invokes a skill. The [README](../README.md) has the details. Offer to word their first prompt with them, per [`references/prompting.md`](references/prompting.md).

If cost is the worry, say where the tokens go and how to spend fewer. pstack spends extra tokens on subagents and review panels. Where your agent can pick a model per subagent, run workers on a fast, cheap model and keep the strongest reasoning model for judgment; running subagents on the session model saves tokens when the chat runs on a cheaper model. A smaller panel runs fewer subagents, one for each entry. Save `/poteto-mode` for work that needs rigor.

The skills use the Agent Skills format, so any coding agent can read them. Workflow skills such as `/poteto-mode`, `/how`, and `/teach` spawn subagents with your agent's own subagent tool and pick models by capability tier, so they work in any agent with a subagent tool.

## Start a task with `/poteto-mode`

`/poteto-mode` matches the task to a playbook, tracks the playbook's steps in a task list, and runs the other skills as the steps need them. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read [`references/prompting.md`](references/prompting.md) before you help word one. [Guide page 2](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/02-poteto-mode.md) has examples.

A skill invocation attaches to one message and fades as the chat moves on, so start each new task with `/poteto-mode`. Mid-chat, "new task" makes it match a fresh playbook. `/poteto-mode` already briefs the subagents its playbook steps spawn with the poteto-mode skill (a poteto-agent). To get the same style from a subagent of your own, brief it with the poteto-mode skill too.

## Pick a skill

The default answer is `/poteto-mode`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | `/poteto-mode` |
| Check that the agent understood their goal and the problem before it starts | `/in-your-own-words` |
| Get a prompt rewritten deeper, not bigger, before sending it: what a top professional would add, their raw material and methods, and an outside check. It returns the prompt and doesn't do the task | `/sharpen` |
| Learn the expert words for what they're building, including words borrowed from neighboring fields, with every cited source checked, and get their description rewritten with them | `/reframe` |
| Know how code works now, or where new code should live | `/how` |
| Know why code is shaped this way, or where a number came from | `/why` |
| Understand a change or subsystem, explained plainly | `/teach` |
| Catch up on their own recent work on a topic | `/recall` |
| Catch up on what changed in this chat since their last message, in plain words and small visuals, with every item waiting on them listed and decidable from the reply alone | `/ketchup` |
| Catch up like `/ketchup`, in a short subtitled video of slides, with the waiting calls as text under it | `/ketchup-video` |
| Know what a small diff could break outside itself | `/blast-radius` |
| Settle types and module shape before code that crosses a function boundary | `/architect` |
| Get several attempts at one brief, merged into the best one | `/arena` |
| Run parallel checks over slices, or race workers, in isolated worktrees | `/swarm` |
| Have several adversaries review a diff and try to break it | `/interrogate` |
| Fix a bug test-first when a cheap local test exists | `/tdd` |
| Apply TypeScript rules to `.ts` or `.tsx` work | `/typescript-best-practices` |
| Strip comments before review, using a reviewer that didn't write them | `/no-comments` |
| Clean AI tells out of prose | `/unslop` |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | `/technical-writing` |
| Hear the last reply again in plain words | `/bro` |
| Give agents a scripted way to drive the app and prove behavior | `/create-verification-skill` |
| Bring a verification skill and its feature map back in line with the app | `/maintain-verification-skill` |
| Formally verify a race, invariant, or other property that tests rarely reach | `/create-formal-verification-skill` |
| Bring a formal verification back in line after the code it covers changed, and learn whether a failure is drift or a bug | `/maintain-formal-verification-skill` |
| Show a PM or designer what the user sees as a chart checked by a TLA+ model, with the shortest path to each state that breaks a rule | `/statechart` |
| Vet a performance number before reporting or acting on it | `/benchmark-checklist` |
| Run a large or cross-cutting change, or one to review after stepping away | `/figure-it-out` |
| Keep a decision log during a run, and review it afterward | `/show-me-your-work` |
| Turn their own working habits into a personal mode skill | `/automate-me` |
| Turn what a finished task taught into skill edits | `/reflect` |
| Stop agents from repeating the same mistakes in this repo | `/correct` |
| Find their way around pstack | `/poteto-help` |

If a skill directory next to this one in your installed skills directory is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/how` explains what the code does. `/why` explains the reasons. `/teach` runs one or both and explains the result plainly.
- `/arena` gives every worker the same brief and merges the best parts. `/swarm` splits work into slices or a race and returns one report.
- `/interrogate` reviews the diff. `/blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/recall` rebuilds context across recent chats. `/ketchup` covers only this chat since the user's last message. Resuming one specific chat or branch is the Session pickup playbook.
- `/figure-it-out` designs one rigorous run. The Autonomous run playbook drives one task to a finish condition.

Not in pstack:

- `/deslop`, `control-cli`, and `control-ui` come from the `cursor-team-kit` collection, bundled alongside pstack here.
- For writing a new skill, use the **writing-for-agents** skill in this repository.
- pstack has no `/orchestrate` skill. If your agent lists `/orchestrate`, another skill set provides it.

## Playbooks and principles

Playbooks are step lists inside `/poteto-mode`, not skills, so they have no slash command. Inside `/poteto-mode`, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship.
- "land the stack" runs Shipping.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs Autopilot-full. "autopilot, don't merge" runs Autopilot-stack.
- "run the eval playbook" runs Eval.

Without `/poteto-mode`, a phrase such as "babysit this pr" can start your agent's own built-in skill for the same job instead. The Playbooks section of the **poteto-mode** skill lists every playbook. [Guide page 6](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/06-verify-and-ship.md) covers opening, babysitting, and landing a PR.

pstack has no planning skill. Your agent's own plan mode, if it has one, works alongside it. For work that spans phases or stacked PRs, asking `/poteto-mode` for a plan runs the Multi-phase plan playbook in the poteto-mode skill directory, which writes the plan and doesn't implement it. For a design question, the Prototype playbook or `/architect` settles it in code first.

Principles are one-rule skills that `/poteto-mode` reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Typing `/principle-<name>` still loads one on demand. [Guide page 8](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/08-principles.md) lists them.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a few turns | A skill invocation attaches to one message. Start each new task with `/poteto-mode`. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | The skills load when the user types them or when `/poteto-mode` runs them, and it doesn't run every skill. |
| Parallel agents overwrote each other | Give each agent its own worktree. |
| An overnight run moved but finished nothing | A repeat-until loop needs a check that can pass or fail, not a duration. See [guide page 7](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/07-overnight.md). |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |

For a run that drifts, [`references/prompting.md`](references/prompting.md) has one-line steers. [Guide page 10](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/10-recipes-and-pitfalls.md) has more pitfalls and the recipes worth copying.

## Make pstack my own

- `/automate-me` drafts a personal mode skill from the user's own history, to use alongside `/poteto-mode`.
- `/reflect` after a session turns its lessons into skill edits the user approves.
- `/poteto-mode write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

[Guide page 9](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/09-make-it-yours.md) covers each of these.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [`references/recipes.md`](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.