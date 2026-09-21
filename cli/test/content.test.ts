import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildManifest,
  parseFrontmatterField,
  scanAgentsMdFiles,
  scanRules,
  scanSkills,
} from '../src/content.ts';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'siku-content-'));
  // 模拟真实仓库结构：嵌套技能、非技能目录、多分类规则
  writeSkill(join(root, 'skills/engineering/init'), '初始化或更新项目的 AGENTS.md');
  writeSkill(join(root, 'skills/engineering/mattcopock/ask-matt'), '向 Matt 提问');
  mkdirSync(join(root, 'skills/engineering/mattcopock/ask-matt/agents'), { recursive: true });
  writeFileSync(join(root, 'skills/engineering/mattcopock/ask-matt/agents/openai.yaml'), 'model: x');
  writeSkill(join(root, 'skills/productivity/eli5'), '把复杂概念讲简单');
  // 无 SKILL.md 的目录不应被识别
  mkdirSync(join(root, 'skills/misc/empty'), { recursive: true });
  // rules 两级结构 + 非 md 文件
  writeRule('common', 'coding-style.md', '# style');
  writeRule('common', 'patterns.md', '# patterns');
  writeRule('typescript', 'coding-style.md', '# ts style');
  mkdirSync(join(root, 'rules/typescript'), { recursive: true });
  writeFileSync(join(root, 'rules/typescript/notes.txt'), 'not markdown');
  // agents-md
  mkdirSync(join(root, 'agents-md'), { recursive: true });
  writeFileSync(join(root, 'agents-md/git-workflow.md'), '## Git');
  writeFileSync(join(root, 'agents-md/coding.md'), '## Coding');
  writeFileSync(join(root, 'agents-md/notes.txt'), 'not markdown');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('scanSkills', () => {
  it('finds skills at any depth with relative-path ids', () => {
    const skills = scanSkills(root);
    expect(skills.map((s) => s.id)).toEqual([
      'engineering/init',
      'engineering/mattcopock/ask-matt',
      'productivity/eli5',
    ]);
  });

  it('uses the SKILL.md directory name as install dirName', () => {
    const askMatt = scanSkills(root).find((s) => s.id.endsWith('ask-matt'));
    expect(askMatt?.dirName).toBe('ask-matt');
    expect(askMatt?.description).toBe('向 Matt 提问');
  });

  it('does not descend into a discovered skill directory', () => {
    // ask-matt/agents 含子目录但无 SKILL.md，且 ask-matt 已是技能边界
    const skills = scanSkills(root);
    expect(skills.filter((s) => s.id.includes('agents'))).toHaveLength(0);
  });

  it('returns empty for missing skills dir', () => {
    expect(scanSkills(join(root, 'nowhere'))).toEqual([]);
  });
});

describe('scanRules', () => {
  it('lists category files and ignores non-md', () => {
    expect(scanRules(root).map((r) => r.id)).toEqual([
      'common/coding-style.md',
      'common/patterns.md',
      'typescript/coding-style.md',
    ]);
  });

  it('keeps category on each rule', () => {
    const ts = scanRules(root).find((r) => r.category === 'typescript');
    expect(ts?.srcFile).toContain('coding-style.md');
  });

  it('returns empty for missing rules dir', () => {
    expect(scanRules(join(root, 'nowhere'))).toEqual([]);
  });
});

describe('scanAgentsMdFiles', () => {
  it('lists only md files sorted by name', () => {
    expect(scanAgentsMdFiles(root).map((f) => f.replaceAll('\\', '/'))).toEqual([
      expect.stringContaining('agents-md/coding.md'),
      expect.stringContaining('agents-md/git-workflow.md'),
    ]);
  });

  it('returns empty for missing agents-md dir', () => {
    expect(scanAgentsMdFiles(join(root, 'nowhere'))).toEqual([]);
  });
});

describe('buildManifest', () => {
  it('aggregates all content kinds', () => {
    const m = buildManifest(root);
    expect(m.rootDir).toBe(root);
    expect(m.skills).toHaveLength(3);
    expect(m.rules).toHaveLength(3);
    expect(m.agentsMdFiles).toHaveLength(2);
  });
});

describe('parseFrontmatterField', () => {
  it('reads top-level scalar fields and strips quotes', () => {
    const md = `---\nname: init\ndescription: "带引号的描述"\n---\n\n# 正文`;
    expect(parseFrontmatterField(md, 'name')).toBe('init');
    expect(parseFrontmatterField(md, 'description')).toBe('带引号的描述');
  });

  it('returns undefined when field or frontmatter missing', () => {
    expect(parseFrontmatterField('# 无 frontmatter', 'description')).toBeUndefined();
    expect(parseFrontmatterField('---\nname: x\n---\n', 'description')).toBeUndefined();
  });
});

function writeSkill(skillDir: string, description: string): void {
  const name = skillDir.split(/[\\/]/).pop();
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  );
}

function writeRule(category: string, file: string, content: string): void {
  mkdirSync(join(root, 'rules', category), { recursive: true });
  writeFileSync(join(root, 'rules', category, file), content);
}
