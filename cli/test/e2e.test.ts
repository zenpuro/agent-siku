import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { performInstall } from '../src/cli.ts';

// 端到端集成：发现 → 计划 → 复制 → 上下文文件 → lock（不经过交互层）
let contentRoot: string;
let sandbox: string;

beforeAll(() => {
  contentRoot = mkdtempSync(join(tmpdir(), 'siku-e2e-content-'));
  writeSkill(join(contentRoot, 'skills/engineering/init'));
  writeSkill(join(contentRoot, 'skills/productivity/eli5'));
  mkdirSync(join(contentRoot, 'rules/common'), { recursive: true });
  writeFileSync(join(contentRoot, 'rules/common/coding-style.md'), '# style');
  mkdirSync(join(contentRoot, 'agents-md'), { recursive: true });
  writeFileSync(join(contentRoot, 'agents-md/git-workflow.md'), '## Git Commit Format');
  sandbox = mkdtempSync(join(tmpdir(), 'siku-e2e-'));
});

afterAll(() => {
  rmSync(contentRoot, { recursive: true, force: true });
  rmSync(sandbox, { recursive: true, force: true });
});

describe('performInstall (integration)', () => {
  it('project install with claude-code installs everything', () => {
    const project = join(sandbox, 'project-a');
    mkdirSync(project, { recursive: true });
    const result = performInstall({
      contentRoot,
      lockSource: { repo: 'zenpuro/agent-siku', ref: 'main' },
      scope: 'project',
      rootDir: project,
      agents: ['claude-code', 'pi'],
      skills: [skill('engineering/init'), skill('productivity/eli5')],
      rules: [
        {
          id: 'common/coding-style.md',
          category: 'common',
          srcFile: join(contentRoot, 'rules/common/coding-style.md'),
        },
      ],
      agentsMd: { inject: true, conflict: 'overwrite' },
    });

    // universal + claude 派生
    expect(existsSync(join(project, '.agents', 'skills', 'init', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(project, '.claude', 'skills', 'eli5', 'SKILL.md'))).toBe(true);
    // rules 保留分类
    expect(
      readFileSync(join(project, '.claude', 'rules', 'common', 'coding-style.md'), 'utf8'),
    ).toBe('# style');
    // AGENTS.md 注入
    const md = readFileSync(join(project, 'AGENTS.md'), 'utf8');
    expect(md).toContain('## Git Commit Format');
    // lock
    expect(result.lockPath).toBe(join(project, 'siku-lock.json'));
    const lock = JSON.parse(readFileSync(result.lockPath, 'utf8'));
    expect(Object.keys(lock.skills).sort()).toEqual(['eli5', 'init']);
    expect(lock.agentsMd).toBe(true);
    expect(result.plan.skillTargets).toHaveLength(4); // 2 技能 × 2 目标
  });

  it('user install without claude-code writes only universal + ~/.agents/AGENTS.md', () => {
    const home = join(sandbox, 'home-a');
    mkdirSync(home, { recursive: true });
    performInstall({
      contentRoot,
      lockSource: { repo: '(local)', ref: 'local' },
      scope: 'user',
      rootDir: home,
      agents: ['pi', 'zcode'],
      skills: [skill('productivity/eli5')],
      rules: [],
      agentsMd: { inject: true, conflict: 'append' },
    });

    expect(existsSync(join(home, '.agents', 'skills', 'eli5', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(home, '.claude'))).toBe(false);
    // 新文件也带标记区块，保证后续 install 可幂等原位替换
    const md = readFileSync(join(home, '.agents', 'AGENTS.md'), 'utf8');
    expect(md).toContain('<!-- siku:start -->\n## Git Commit Format\n<!-- siku:end -->');
    expect(existsSync(join(home, '.claude', 'CLAUDE.md'))).toBe(false);
    // 无 rules 时 lock.rules 为空
    const lock = JSON.parse(readFileSync(join(home, 'siku-lock.json'), 'utf8'));
    expect(lock.rules).toEqual({});
  });
});

function skill(id: string) {
  return {
    id,
    dirName: id.split('/').pop() ?? id,
    srcDir: join(contentRoot, 'skills', id),
  };
}

function writeSkill(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${dir.split(/[\\/]/).pop()}\n---\nbody\n`);
}
