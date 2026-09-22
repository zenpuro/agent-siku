import { describe, expect, it } from 'vitest';
import {
  buildTree,
  checkState,
  flattenTree,
  leafPaths,
  type PickerNode,
  selectionStats,
  toggleAll,
  toggleNode,
} from '../src/tree.ts';

const IDS = [
  'brand/brand-naming',
  'engineering/init',
  'engineering/mattcopock/ask-matt',
  'engineering/mattcopock/code-review',
  'engineering/show-me',
  'pm/competitor-analysis',
  'loose-skill',
];

/** 按名称取节点，取不到直接让测试失败。 */
function pick(nodes: readonly PickerNode[], name: string): PickerNode {
  const found = nodes.find((n) => n.name === name);
  if (!found) throw new Error(`node not found: ${name}`);
  return found;
}

describe('buildTree', () => {
  it('按 id 前缀构建任意深度的树', () => {
    const roots = buildTree(IDS);
    expect(roots.map((n) => n.name)).toEqual(['brand', 'engineering', 'loose-skill', 'pm']);
    const engineering = pick(roots, 'engineering');
    expect(engineering.type).toBe('dir');
    expect(engineering.children.map((n) => n.name)).toEqual(['init', 'mattcopock', 'show-me']);
    const matt = pick(engineering.children, 'mattcopock');
    expect(matt.children.map((n) => n.name)).toEqual(['ask-matt', 'code-review']);
    expect(pick(matt.children, 'ask-matt').type).toBe('leaf');
  });

  it('相同前缀共享同一目录节点', () => {
    const roots = buildTree(['a/b/x', 'a/b/y', 'a/c']);
    const a = roots[0];
    expect(a?.children.map((n) => n.name)).toEqual(['b', 'c']);
  });

  it('叶子路径保持原始 id', () => {
    const roots = buildTree(IDS);
    const ask = pick(pick(pick(roots, 'engineering').children, 'mattcopock').children, 'ask-matt');
    expect(ask.path).toBe('engineering/mattcopock/ask-matt');
  });

  it('拒绝空段路径', () => {
    expect(() => buildTree(['a//b'])).toThrow();
    expect(() => buildTree(['/'])).toThrow();
  });
});

describe('flattenTree', () => {
  it('深度优先展开，目录在后代之前', () => {
    const rows = flattenTree(buildTree(IDS));
    expect(rows[0]?.node.name).toBe('brand');
    expect(rows[1]?.node.name).toBe('brand-naming');
    expect(rows[1]?.depth).toBe(1);
    const askIndex = rows.findIndex((r) => r.node.name === 'ask-matt');
    const mattIndex = rows.findIndex((r) => r.node.name === 'mattcopock');
    expect(mattIndex).toBeLessThan(askIndex);
    expect(rows[askIndex]?.depth).toBe(2);
  });

  it('按叶子完整路径子串过滤（大小写不敏感），无匹配后代的目录被剪掉', () => {
    const rows = flattenTree(buildTree(IDS), 'ASK-MATT');
    expect(rows.map((r) => r.node.name)).toEqual(['engineering', 'mattcopock', 'ask-matt']);
  });

  it('目录自身名不匹配但有匹配后代时保留', () => {
    const rows = flattenTree(buildTree(IDS), 'code-review');
    expect(rows.map((r) => r.node.name)).toEqual(['engineering', 'mattcopock', 'code-review']);
  });

  it('空结果返回空数组', () => {
    expect(flattenTree(buildTree(IDS), 'nope')).toEqual([]);
  });
});

describe('selection', () => {
  const roots = buildTree(IDS);
  const engineering = pick(roots, 'engineering');
  const init = pick(engineering.children, 'init');
  /** 合成根：等价于 select all 行的统计范围。 */
  const syntheticRoot: PickerNode = {
    type: 'dir',
    name: '',
    path: '',
    children: [...roots],
  };

  it('toggleNode 叶子只影响自身', () => {
    const selected = new Set<string>();
    toggleNode(init, selected);
    expect(selected).toEqual(new Set(['engineering/init']));
    expect(checkState(init, selected)).toBe('all');
    toggleNode(init, selected);
    expect(selected.size).toBe(0);
  });

  it('toggleNode 目录级联选中全部后代，再切一次全部清空', () => {
    const selected = new Set<string>();
    toggleNode(engineering, selected);
    expect([...selected].sort()).toEqual([
      'engineering/init',
      'engineering/mattcopock/ask-matt',
      'engineering/mattcopock/code-review',
      'engineering/show-me',
    ]);
    expect(checkState(engineering, selected)).toBe('all');
    expect(checkState(syntheticRoot, selected)).toBe('partial');
    toggleNode(engineering, selected);
    expect(selected.size).toBe(0);
  });

  it('toggleAll 全选与清空', () => {
    const selected = new Set<string>();
    toggleAll(roots, selected);
    expect(selected.size).toBe(7);
    expect(selectionStats(pick(roots, 'brand'), selected)).toEqual({ picked: 1, total: 1 });
    expect(checkState(engineering, selected)).toBe('all');
    expect(checkState(syntheticRoot, selected)).toBe('all');
    toggleAll(roots, selected);
    expect(selected.size).toBe(0);
  });

  it('leafPaths 返回先序全部叶子', () => {
    expect(leafPaths(engineering)).toHaveLength(4);
    expect(leafPaths(pick(roots, 'loose-skill'))).toEqual(['loose-skill']);
  });
});
