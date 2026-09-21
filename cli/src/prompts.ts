import * as clack from '@clack/prompts';
import { agentOrder, agents } from './agents.ts';
import type { AgentsMdConflict } from './agents-md.ts';
import type { AgentId, RuleInfo, SkillInfo } from './types.ts';

type Option = { value: string; label: string; hint?: string };

/** clack 的取消信号统一转成优雅退出。 */
function settled<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    clack.cancel('已取消安装。');
    process.exit(0);
  }
  return value as T;
}

export async function promptScope(flag?: 'project' | 'user'): Promise<'project' | 'user'> {
  if (flag) return flag;
  return settled<'project' | 'user'>(
    await clack.select<'project' | 'user'>({
      message: '安装到哪个环境？',
      options: [
        { value: 'project', label: '当前项目', hint: '写入 .agents/skills/、AGENTS.md 等' },
        { value: 'user', label: '用户环境（~）', hint: '写入 ~/.agents/ 等全局位置' },
      ],
    }),
  );
}

export async function promptAgents(preselected: readonly AgentId[]): Promise<AgentId[]> {
  return settled<AgentId[]>(
    await clack.multiselect<AgentId>({
      message: `选择要适配的 agent（已检测到 ${preselected.length ? preselected.map((a) => agents[a].displayName).join('、') : '无'}）`,
      options: agentOrder.map((id) => ({ value: id, label: agents[id].displayName })),
      initialValues: [...preselected],
      required: false,
    }),
  );
}

/** 分类分组：技能 id 首段为分类；无分类的技能只作为叶子项出现。 */
export async function promptSkills(skills: readonly SkillInfo[]): Promise<SkillInfo[]> {
  const picked = await pickGrouped({
    message: `选择要安装的 skills（${skills.length} 个可选）`,
    groups: groupBy(skills, (s) => (s.id.includes('/') ? s.id.split('/')[0] : undefined)),
    itemLabel: (s) => s.id,
    itemValue: (s) => `skill:${s.id}`,
    hint: (s) => s.description,
  });
  const result = new Map<string, SkillInfo>();
  for (const value of picked) {
    if (value.startsWith('dir:')) {
      const category = value.slice(4);
      for (const s of skills) {
        if (s.id.startsWith(`${category}/`)) result.set(s.id, s);
      }
    } else {
      const s = skills.find((x) => x.id === value.slice(6));
      if (s) result.set(s.id, s);
    }
  }
  return [...result.values()];
}

export async function promptRules(
  rules: readonly RuleInfo[],
  hasClaude: boolean,
): Promise<RuleInfo[]> {
  if (!hasClaude) {
    clack.log.info('未选择 Claude Code，跳过 rules（仅 Claude Code 读取 .claude/rules/）');
    return [];
  }
  if (rules.length === 0) {
    clack.log.info('内容源中没有 rules，跳过');
    return [];
  }
  const picked = await pickGrouped({
    message: `选择要安装的 rules（${rules.length} 个可选，仅对 Claude Code 生效）`,
    groups: groupBy(rules, (r) => r.category),
    itemLabel: (r) => r.id,
    itemValue: (r) => `rule:${r.id}`,
  });
  const result = new Map<string, RuleInfo>();
  for (const value of picked) {
    if (value.startsWith('dir:')) {
      const category = value.slice(4);
      for (const r of rules) {
        if (r.category === category) result.set(r.id, r);
      }
    } else {
      const r = rules.find((x) => x.id === value.slice(5));
      if (r) result.set(r.id, r);
    }
  }
  return [...result.values()];
}

export async function promptInjectAgentsMd(): Promise<boolean> {
  return settled<boolean>(
    await clack.confirm({ message: '是否注入 agents-md（生成 AGENTS.md 上下文）？' }),
  );
}

/** 目标不存在时无需询问处理方式。 */
export async function promptAgentsMdConflict(targetExists: boolean): Promise<AgentsMdConflict> {
  if (!targetExists) return 'overwrite';
  return settled<AgentsMdConflict>(
    await clack.select<AgentsMdConflict>({
      message: 'AGENTS.md / CLAUDE.md 已存在，如何处理？',
      options: [
        { value: 'append', label: '追加标记区块（推荐，保留已有内容）' },
        { value: 'overwrite', label: '覆盖整个文件' },
        { value: 'skip', label: '跳过，不写入' },
      ],
    }),
  );
}

interface GroupedPickOptions<T> {
  message: string;
  groups: Array<{ category: string | undefined; items: T[] }>;
  itemValue: (item: T) => string;
  itemLabel: (item: T) => string;
  hint?: (item: T) => string | undefined;
}

/** 单层多选：每个分类一条「目录全选」项 + 缩进的叶子项，支持搜索过滤。 */
async function pickGrouped<T>(opts: GroupedPickOptions<T>): Promise<string[]> {
  const options: Option[] = [];
  for (const { category, items } of opts.groups) {
    if (category !== undefined) {
      options.push({ value: `dir:${category}`, label: `◆ ${category}/  全部 ${items.length} 项` });
    }
    for (const item of items) {
      options.push({
        value: opts.itemValue(item),
        label: `   ${opts.itemLabel(item)}`,
        hint: opts.hint?.(item),
      });
    }
  }
  return settled<string[]>(
    await clack.autocompleteMultiselect<string>({
      message: opts.message,
      options,
      required: false,
    }),
  );
}

function groupBy<T>(
  items: readonly T[],
  categoryOf: (item: T) => string | undefined,
): Array<{ category: string | undefined; items: T[] }> {
  const categorized = new Map<string, T[]>();
  const loose: T[] = [];
  for (const item of items) {
    const category = categoryOf(item);
    if (category === undefined) {
      loose.push(item);
      continue;
    }
    const bucket = categorized.get(category);
    if (bucket) bucket.push(item);
    else categorized.set(category, [item]);
  }
  const groups: Array<{ category: string | undefined; items: T[] }> = [...categorized.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({ category, items }));
  if (loose.length > 0) groups.push({ category: undefined, items: loose });
  return groups;
}
