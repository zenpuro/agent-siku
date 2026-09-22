import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const BLOCK = '<!-- siku:start -->\nhello\n<!-- siku:end -->\n';

  it('writes when target missing', () => {
    const target = join(dir, 'new.md');
    expect(applyAgentsMd(target, 'hello', 'overwrite')).toBe('written');
    // 新文件也必须带标记区块，保证后续 install 幂等替换
    expect(readFileSync(target, 'utf8')).toBe(BLOCK);
  });

  it('overwrites existing file entirely', () => {
    const target = join(dir, 'over.md');
    writeFileSync(target, 'old manual content');
    expect(applyAgentsMd(target, 'hello', 'overwrite')).toBe('overwritten');
    expect(readFileSync(target, 'utf8')).toBe(BLOCK);
  });

  it('fresh write then append replaces in place instead of stacking', () => {
    const target = join(dir, 'fresh.md');
    applyAgentsMd(target, 'v1', 'overwrite');
    applyAgentsMd(target, 'v2', 'append');
    const out = readFileSync(target, 'utf8');
    expect(out.match(/<!-- siku:start -->/g)).toHaveLength(1);
    expect(out).toContain('v2');
    expect(out).not.toContain('v1');
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

  it('does not expand $ sequences in content', () => {
    // content 里的 $&、$` 不应被 String.replace 当作特殊替换序列展开
    const existing = '<!-- siku:start -->\nold\n<!-- siku:end -->\n';
    const out = mergeMarkedBlock(existing, 'price $& and $` done');
    expect(out).toBe('<!-- siku:start -->\nprice $& and $` done\n<!-- siku:end -->\n');
  });
});
