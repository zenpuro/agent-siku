import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  AgentId,
  InstallPlan,
  InstallSelection,
  RuleInfo,
  RuleTarget,
  SkillInfo,
  SkillTarget,
} from './types.ts';

const CLAUDE_ARTIFACT_AGENT: AgentId = 'claude-code';

/**
 * 把用户选择映射为目标文件操作。纯函数，不做任何 IO。
 * - skills 始终装入 .agents/skills/；选择了 claude-code 时派生一份 .claude/skills/
 * - rules 仅在选择了 claude-code 时装入 .claude/rules/（保留分类子目录）
 */
export function planInstall(
  rootDir: string,
  agents: readonly AgentId[],
  selection: InstallSelection,
): InstallPlan {
  const warnings: string[] = [];
  const claude = agents.includes(CLAUDE_ARTIFACT_AGENT);

  const winners = resolveDirNameConflicts(selection.skills, warnings);
  const skillTargets: SkillTarget[] = [];
  for (const skill of winners) {
    skillTargets.push({ skill, toDir: join(rootDir, '.agents', 'skills', skill.dirName) });
    if (claude) {
      skillTargets.push({ skill, toDir: join(rootDir, '.claude', 'skills', skill.dirName) });
    }
  }

  const ruleTargets: RuleTarget[] = claude
    ? selection.rules.map((rule) => ({ rule, toFile: join(rootDir, '.claude', 'rules', rule.id) }))
    : [];

  return { skillTargets, ruleTargets, warnings };
}

/** 同名技能目录不能共存于同一目标目录：按选择顺序先到先得，后者跳过并告警。 */
function resolveDirNameConflicts(skills: readonly SkillInfo[], warnings: string[]): SkillInfo[] {
  const seen = new Map<string, SkillInfo>();
  for (const skill of skills) {
    const existing = seen.get(skill.dirName);
    if (existing) {
      warnings.push(
        `技能目录名冲突：${existing.id} 与 ${skill.id} 都会安装为 ${skill.dirName}/，已跳过后者`,
      );
      continue;
    }
    seen.set(skill.dirName, skill);
  }
  return [...seen.values()];
}

/**
 * 执行安装计划：逐目标复制。
 * 只写入/覆盖计划内的文件，不触碰目标目录中的其他既有内容。
 */
export function applyInstall(plan: InstallPlan): void {
  for (const { skill, toDir } of plan.skillTargets) {
    mkdirSync(dirname(toDir), { recursive: true });
    cpSync(skill.srcDir, toDir, { recursive: true, force: true });
  }
  for (const { rule, toFile } of plan.ruleTargets) {
    mkdirSync(dirname(toFile), { recursive: true });
    copyFileSync(rule.srcFile, toFile);
  }
}

/** 安装后校验：所有目标位置都应存在。 */
export function verifyInstall(plan: InstallPlan): string[] {
  const missing: string[] = [];
  for (const { toDir } of plan.skillTargets) {
    if (!existsSync(toDir)) missing.push(toDir);
  }
  for (const { toFile } of plan.ruleTargets) {
    if (!existsSync(toFile)) missing.push(toFile);
  }
  return missing;
}
