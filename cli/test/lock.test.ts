import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLockFile, hashDir, hashFile, writeLockFile } from '../src/lock.ts';
import type { InstallPlan, LockFile } from '../src/types.ts';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'siku-lock-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('hashDir / hashFile', () => {
  it('is stable across identical content and sensitive to changes', () => {
    const a = join(dir, 'skill-a');
    const b = join(dir, 'skill-b');
    mkdirSync(join(a, 'sub'), { recursive: true });
    mkdirSync(join(b, 'sub'), { recursive: true });
    writeFileSync(join(a, 'SKILL.md'), '# same');
    writeFileSync(join(a, 'sub', 'x.md'), 'x');
    writeFileSync(join(b, 'SKILL.md'), '# same');
    writeFileSync(join(b, 'sub', 'x.md'), 'x');
    expect(hashDir(a)).toBe(hashDir(b));

    writeFileSync(join(b, 'sub', 'x.md'), 'changed');
    expect(hashDir(b)).not.toBe(hashDir(a));
  });

  it('hashFile differs for different content', () => {
    const f1 = join(dir, 'f1.md');
    const f2 = join(dir, 'f2.md');
    writeFileSync(f1, 'one');
    writeFileSync(f2, 'two');
    expect(hashFile(f1)).not.toBe(hashFile(f2));
    expect(hashFile(f1)).toBe(hashFile(f1));
  });
});

describe('buildLockFile + writeLockFile', () => {
  it('dedupes skills across universal/claude targets and records rules by id', () => {
    const skillSrc = join(dir, 'skill-src');
    mkdirSync(skillSrc, { recursive: true });
    writeFileSync(join(skillSrc, 'SKILL.md'), 'body');
    const ruleSrc = join(dir, 'rule.md');
    writeFileSync(ruleSrc, 'rule body');

    const plan: InstallPlan = {
      skillTargets: [
        {
          skill: { id: 'e/init', dirName: 'init', srcDir: skillSrc },
          toDir: '/x/.agents/skills/init',
        },
        {
          skill: { id: 'e/init', dirName: 'init', srcDir: skillSrc },
          toDir: '/x/.claude/skills/init',
        },
      ],
      ruleTargets: [
        {
          rule: { id: 'common/style.md', category: 'common', srcFile: ruleSrc },
          toFile: '/x/.claude/rules/common/style.md',
        },
      ],
      warnings: [],
    };

    const lock = buildLockFile(
      { url: 'https://github.com/zenpuro/agent-siku', ref: 'main', sha: 'abc1234' },
      plan,
      true,
    );
    expect(lock.version).toBe(1);
    expect(lock.source).toEqual({
      url: 'https://github.com/zenpuro/agent-siku',
      ref: 'main',
      sha: 'abc1234',
    });
    expect(Object.keys(lock.skills)).toEqual(['init']);
    expect(lock.skills.init).toMatch(/^[0-9a-f]{64}$/);
    expect(lock.rules['common/style.md']).toMatch(/^[0-9a-f]{64}$/);
    expect(lock.agentsMd).toBe(true);
    expect(lock.installedAt).toBeTruthy();
  });

  it('writeLockFile roundtrips as JSON at <root>/siku-lock.json', () => {
    const lock: LockFile = {
      version: 1,
      installedAt: '2026-01-01T00:00:00.000Z',
      source: { url: 'https://github.com/zenpuro/agent-siku', ref: 'main' },
      skills: {},
      rules: {},
      agentsMd: false,
    };
    const root = join(dir, 'proj');
    mkdirSync(root, { recursive: true });
    const file = writeLockFile(root, lock);
    expect(file).toContain('siku-lock.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(lock);
  });
});
