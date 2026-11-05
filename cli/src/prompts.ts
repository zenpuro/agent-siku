import * as clack from '@clack/prompts';
import { agentOrder, agents } from './agents.ts';
import type { AgentsMdConflict } from './agents-md.ts';
import { parseRepoUrl } from './download.ts';
import { buildTree } from './tree.ts';
import { PICKER_CANCEL, treeMultiselect } from './tree-picker.ts';
import type { AgentId, AgentsMdFileInfo, RuleInfo, SkillInfo } from './types.ts';

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
          parseRepoUrl(value ?? '');
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      },
    }),
  );
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

/**
 * agents-md 树形多选（与 skills / rules 同一套交互：搜索、目录级联、←→ 折叠、select all 计数）。
 * 一个都没选 = 不注入；内容源没有 agents-md 文件时直接跳过。
 */
export async function promptAgentsMd(
  files: readonly AgentsMdFileInfo[],
): Promise<AgentsMdFileInfo[]> {
  if (files.length === 0) {
    clack.log.info('No agents-md found in the content source — skipping');
    return [];
  }
  const picked = settled<string[]>(
    await treeMultiselect({
      message: `Select agents-md files to inject (${files.length} available, 0 = skip)`,
      roots: buildTree(files.map((f) => f.id)),
    }),
  );
  const byId = new Map(files.map((f) => [f.id, f]));
  return picked.map((id) => byId.get(id)).filter((f): f is AgentsMdFileInfo => f !== undefined);
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
