import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import type { ContentManifest, RuleInfo, SkillInfo } from './types.ts';

const SKILL_FILE = 'SKILL.md';

/**
 * 扫描内容根目录，产出可安装清单。
 * 内容根 = 内容仓库解压后的根（或 --source 指定的本地目录）。
 */
export function buildManifest(contentRoot: string): ContentManifest {
  return {
    rootDir: contentRoot,
    skills: scanSkills(contentRoot),
    rules: scanRules(contentRoot),
    agentsMdFiles: scanAgentsMdFiles(contentRoot),
  };
}

/** skills/ 下任何直接包含 SKILL.md 的目录都是一个技能（任意深度）。 */
export function scanSkills(contentRoot: string): SkillInfo[] {
  const skillsDir = join(contentRoot, 'skills');
  if (!existsSync(skillsDir)) return [];
  const skills: SkillInfo[] = [];
  walkSkills(skillsDir, skillsDir, skills);
  return skills.sort((a, b) => a.id.localeCompare(b.id));
}

function walkSkills(skillsDir: string, dir: string, out: SkillInfo[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (existsSync(join(full, SKILL_FILE))) {
      // 技能边界：不再向内层找嵌套技能
      out.push(toSkillInfo(skillsDir, full));
    } else {
      walkSkills(skillsDir, full, out);
    }
  }
}

function toSkillInfo(skillsDir: string, skillDir: string): SkillInfo {
  const skillFile = readFileSync(join(skillDir, SKILL_FILE), 'utf8');
  return {
    id: toPosixPath(relative(skillsDir, skillDir)),
    dirName: basename(skillDir),
    srcDir: skillDir,
    description: parseFrontmatterField(skillFile, 'description'),
  };
}

/** rules/<分类>/<文件>.md，两级结构。 */
export function scanRules(contentRoot: string): RuleInfo[] {
  const rulesDir = join(contentRoot, 'rules');
  if (!existsSync(rulesDir)) return [];
  const rules: RuleInfo[] = [];
  for (const category of readdirSync(rulesDir, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const categoryDir = join(rulesDir, category.name);
    for (const file of readdirSync(categoryDir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.toLowerCase().endsWith('.md')) continue;
      rules.push({
        id: toPosixPath(join(category.name, file.name)),
        category: category.name,
        srcFile: join(categoryDir, file.name),
      });
    }
  }
  return rules.sort((a, b) => a.id.localeCompare(b.id));
}

/** agents-md/ 下全部 .md 文件，按文件名排序。 */
export function scanAgentsMdFiles(contentRoot: string): string[] {
  const dir = join(contentRoot, 'agents-md');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map((e) => e.name)
    .sort()
    .map((name) => join(dir, name));
}

/**
 * 从 frontmatter 中读取单个字段值（仅支持顶层单行标量，够 SKILL.md 使用）。
 * 找不到时返回 undefined。
 */
export function parseFrontmatterField(content: string, field: string): string | undefined {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1];
  if (!fm) return undefined;
  const line = new RegExp(`^${field}:\\s*(.+)$`, 'm').exec(fm)?.[1];
  if (line === undefined) return undefined;
  const trimmed = line.trim();
  return trimmed.replace(/^['"]|['"]$/g, '') || undefined;
}

function toPosixPath(p: string): string {
  return p.replaceAll('\\', '/');
}
