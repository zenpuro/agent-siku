import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAgentsMd, buildAgentsMdContent, mergeMarkedBlock } from '../src/agents-md.ts';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'siku-agentsmd-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('buildAgentsMdContent', () => {
  it('concatenates files in order with blank-line separation', () => {
    const a = join(dir, 'a.md');
    const b = join(dir, 'b.md');
    writeFileSync(a, '## A\ncontent a\n');
    writeFileSync(b, '## B\ncontent b');
    expect(buildAgentsMdContent([a, b])).toBe('## A\ncontent a\n\n## B\ncontent b');
  });
});

describe('applyAgentsMd', () => {
  it('writes when target missing', () => {
    const target = join(dir, 'new.md');
    expect(applyAgentsMd(target, 'hello', 'overwrite')).toBe('written');
    expect(readFileSync(target, 'utf8')).toBe('hello\n');
  });

  it('overwrites existing file entirely', () => {
    const target = join(dir, 'over.md');
    writeFileSync(target, 'old manual content');
    expect(applyAgentsMd(target, 'new', 'overwrite')).toBe('overwritten');
    expect(readFileSync(target, 'utf8')).toBe('new\n');
  });

  it('append preserves existing content and adds marked block', () => {
    const target = join(dir, 'append.md');
    writeFileSync(target, '# My Project\nmanual notes');
    expect(applyAgentsMd(target, 'injected', 'append')).toBe('appended');
    const out = readFileSync(target, 'utf8');
    expect(out.startsWith('# My Project\nmanual notes')).toBe(true);
    expect(out).toContain('<!-- siku:start -->\ninjected\n<!-- siku:end -->');
  });

  it('append is idempotent: replaces the old block instead of stacking', () => {
    const target = join(dir, 'idem.md');
    writeFileSync(target, 'base');
    applyAgentsMd(target, 'v1', 'append');
    applyAgentsMd(target, 'v2', 'append');
    const out = readFileSync(target, 'utf8');
    expect(out.match(/<!-- siku:start -->/g)).toHaveLength(1);
    expect(out).toContain('v2');
    expect(out).not.toContain('v1');
  });

  it('skip leaves the file untouched', () => {
    const target = join(dir, 'skip.md');
    writeFileSync(target, 'untouched');
    expect(applyAgentsMd(target, 'x', 'skip')).toBe('skipped');
    expect(readFileSync(target, 'utf8')).toBe('untouched');
  });
});

describe('mergeMarkedBlock', () => {
  it('treats markers as literals, not regex', () => {
    // 标记里的正则元字符不应破坏替换
    const existing = `x\n<!-- siku:start -->\nold\n<!-- siku:end -->\ny`;
    expect(mergeMarkedBlock(existing, 'n[e]w')).toContain('n[e]w');
  });
});
