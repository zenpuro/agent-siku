import * as clack from '@clack/prompts';
import { agentOrder, agents } from './agents.ts';
import type { AgentsMdConflict } from './agents-md.ts';
import { parseRepoInput } from './download.ts';
import { buildTree } from './tree.ts';
import { PICKER_CANCEL, treeMultiselect } from './tree-picker.ts';
import type { AgentId, RuleInfo, SkillInfo } from './types.ts';

/** clack 的取消信号统一转成优雅退出。 */
function settled<T>(value: T | symbol): T {
  if (clack.isCancel(value) || value === PICKER_CANCEL) {
    clack.cancel('Installation cancelled.');
    process.exit(0);
  }
  return value as T;
}

/** 仓库链接必填：CLI 未传且未设 SIKU_REPO 时在此询问。 */
export async function promptRepo(): Promise<string> {
  return settled<string>(
    await clack.text({
      message: 'Content repo (GitHub URL or owner/repo):',
      placeholder: 'https://github.com/owner/repo',
      validate: (value) => {
        try {
          parseRepoInput(value ?? '');
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      },
    }),
  );
}

/** 私有仓库认证：仅在远端 404 且未提供 token 时触发。 */
export async function promptToken(): Promise<string | undefined> {
  const token = settled<string>(
    await clack.password({
      message: 'Repo not found or private — paste a GitHub token (blank to abort):',
    }),
  );
  return token.trim() || undefined;
}

export async function promptScope(flag?: 'project' | 'user'): Promise<'project' | 'user'> {
  if (flag) return flag;
  return settled<'project' | 'user'>(
    await clack.select<'project' | 'user'>({
      message: 'Where should the content be installed?',
      options: [
        {
          value: 'project',
          label: 'Current project',
          hint: 'Writes .agents/skills/, AGENTS.md and more into the project',
        },
        {
          value: 'user',
          label: 'User home (~)',
          hint: 'Writes ~/.agents/ and other global locations',
        },
      ],
    }),
  );
}

export async function promptAgents(preselected: readonly AgentId[]): Promise<AgentId[]> {
  const detected =
    preselected.length > 0
      ? ` (detected: ${preselected.map((a) => agents[a].displayName).join(', ')})`
      : '';
  return settled<AgentId[]>(
    await clack.multiselect<AgentId>({
      message: `Select agents to adapt${detected}`,
      options: agentOrder.map((id) => ({ value: id, label: agents[id].displayName })),
      initialValues: [...preselected],
      required: false,
    }),
  );
}

export async function promptSkills(skills: readonly SkillInfo[]): Promise<SkillInfo[]> {
  const picked = settled<string[]>(
    await treeMultiselect({
      message: `Select skills to install (${skills.length} available)`,
      roots: buildTree(skills.map((s) => s.id)),
    }),
  );
  const byId = new Map(skills.map((s) => [s.id, s]));
  return picked.map((id) => byId.get(id)).filter((s): s is SkillInfo => s !== undefined);
}

export async function promptRules(
  rules: readonly RuleInfo[],
  hasClaude: boolean,
): Promise<RuleInfo[]> {
  if (!hasClaude) {
    clack.log.info(
      'Claude Code not selected — skipping rules (only Claude Code reads .claude/rules/)',
    );
    return [];
  }
  if (rules.length === 0) {
    clack.log.info('No rules found in the content source — skipping');
    return [];
  }
  const picked = settled<string[]>(
    await treeMultiselect({
      message: `Select rules to install (${rules.length} available, Claude Code only)`,
      roots: buildTree(rules.map((r) => r.id)),
    }),
  );
  const byId = new Map(rules.map((r) => [r.id, r]));
  return picked.map((id) => byId.get(id)).filter((r): r is RuleInfo => r !== undefined);
}

export async function promptInjectAgentsMd(): Promise<boolean> {
  return settled<boolean>(
    await clack.confirm({ message: 'Inject agents-md (generate AGENTS.md context)?' }),
  );
}

/** 目标不存在时无需询问处理方式。 */
export async function promptAgentsMdConflict(targetExists: boolean): Promise<AgentsMdConflict> {
  if (!targetExists) return 'overwrite';
  return settled<AgentsMdConflict>(
    await clack.select<AgentsMdConflict>({
      message: 'AGENTS.md / CLAUDE.md already exists. How to proceed?',
      options: [
        { value: 'append', label: 'Append marked section (recommended, keeps existing content)' },
        { value: 'overwrite', label: 'Overwrite the entire file' },
        { value: 'skip', label: 'Skip, do not write' },
      ],
    }),
  );
}
