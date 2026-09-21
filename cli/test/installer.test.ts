import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyInstall, planInstall, verifyInstall } from '../src/installer.ts';
import type { InstallSelection, SkillInfo } from '../src/types.ts';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'siku-install-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeSkill(id: string, dirName: string, srcDir: string): SkillInfo {
  return { id, dirName, srcDir };
}

function makeSelectionDir(skills: SkillInfo[], rules: string[] = []): InstallSelection {
  const fsRoot = mkdtempSync(join(tmpdir(), 'siku-sel-'));
  const selection: InstallSelection = {
    skills: skills.map((s, i) => {
      const srcDir = join(fsRoot, `s${i}`);
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'SKILL.md'), `# ${s.id}`);
      writeFileSync(join(srcDir, s.dirName === 'extra-files' ? 'extra.md' : 'body.md'), 'content');
      return { ...s, srcDir };
    }),
    rules: rules.map((id, i) => {
      const srcFile = join(fsRoot, `r${i}.md`);
      writeFileSync(srcFile, `# rule ${id}`);
      return { id, category: id.split('/')[0] ?? '', srcFile };
    }),
    injectAgentsMd: false,
  };
  return selection;
}

describe('planInstall', () => {
  it('always plans universal .agents/skills targets', () => {
    const sel = makeSelectionDir([makeSkill('engineering/init', 'init', 'x')]);
    const plan = planInstall(root, ['pi'], sel);
    expect(plan.skillTargets).toHaveLength(1);
    expect(plan.skillTargets[0]?.toDir).toContain(join('.agents', 'skills', 'init'));
    expect(plan.ruleTargets).toHaveLength(0);
  });

  it('derives .claude/skills targets when claude-code selected', () => {
    const sel = makeSelectionDir([makeSkill('engineering/init', 'init', 'x')]);
    const plan = planInstall(root, ['pi', 'claude-code'], sel);
    const dirs = plan.skillTargets.map((t) => t.toDir);
    expect(dirs).toHaveLength(2);
    expect(dirs.some((d) => d.includes(join('.claude', 'skills')))).toBe(true);
  });

  it('plans rules only for claude-code, preserving category subdirs', () => {
    const sel = makeSelectionDir([], ['common/coding-style.md']);
    const plan = planInstall(root, ['zcode'], sel);
    expect(plan.ruleTargets).toHaveLength(0);
    const planClaude = planInstall(root, ['claude-code'], sel);
    expect(planClaude.ruleTargets[0]?.toFile).toContain(
      join('.claude', 'rules', 'common', 'coding-style.md'),
    );
  });

  it('skips duplicate skill dir names with a warning', () => {
    const sel = makeSelectionDir([
      makeSkill('engineering/init', 'init', 'x'),
      makeSkill('other/init-clone', 'init', 'y'),
    ]);
    const plan = planInstall(root, ['pi'], sel);
    expect(plan.skillTargets).toHaveLength(1);
    expect(plan.warnings[0]).toContain('init-clone');
    expect(plan.warnings[0]).toContain('已跳过');
  });
});

describe('applyInstall + verifyInstall', () => {
  it('copies skill trees and rule files; never deletes unrelated content', () => {
    const sel = makeSelectionDir(
      [makeSkill('productivity/eli5', 'eli5', 'x')],
      ['common/patterns.md'],
    );
    const project = join(root, 'proj-a');
    mkdirSync(project, { recursive: true });
    const plan = planInstall(project, ['claude-code'], sel);

    // 目标里预置内容：一个会被覆盖，一个不在本次清单内
    const preexisting = join(project, '.agents', 'skills', 'eli5', 'keep.md');
    mkdirSync(join(project, '.agents', 'skills', 'eli5'), { recursive: true });
    writeFileSync(preexisting, 'user content');
    writeFileSync(join(project, '.agents', 'skills', 'eli5', 'body.md'), 'stale');

    applyInstall(plan);

    expect(verifyInstall(plan)).toEqual([]);
    expect(read(project, '.agents/skills/eli5/body.md')).toBe('content'); // 被覆盖
    expect(read(project, '.claude/skills/eli5/body.md')).toBe('content'); // 派生
    expect(read(project, '.claude/rules/common/patterns.md')).toBe('# rule common/patterns.md');
    expect(existsSync(preexisting)).toBe(true); // 清单外文件原样保留
    expect(read(project, '.agents/skills/eli5/keep.md')).toBe('user content');
  });

  it('is idempotent across repeated installs', () => {
    const sel = makeSelectionDir([makeSkill('engineering/tdd', 'tdd', 'x')]);
    const project = join(root, 'proj-b');
    mkdirSync(project, { recursive: true });
    const plan = planInstall(project, ['pi'], sel);
    applyInstall(plan);
    applyInstall(plan);
    expect(verifyInstall(plan)).toEqual([]);
    expect(read(project, '.agents/skills/tdd/body.md')).toBe('content');
  });
});

function read(base: string, posixPath: string): string {
  return readFileSync(join(base, ...posixPath.split('/')), 'utf8');
}
