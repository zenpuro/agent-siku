/**
 * 树形多选的数据模型：把 id（如 engineering/mattcopock/ask-matt）解析成
 * 任意深度的目录树，并提供过滤、计数与级联选择的纯函数。
 * 交互渲染见 tree-picker.ts。
 */

export interface PickerNode {
  /** 目录或叶子；叶子对应一个 skill / rule。 */
  type: 'dir' | 'leaf';
  /** 展示名：路径的最后一段。 */
  name: string;
  /** 完整路径：叶子为原始 id；目录为其路径前缀。 */
  path: string;
  /** 仅目录持有子节点。 */
  children: PickerNode[];
}

export type CheckState = 'all' | 'partial' | 'none';

/** 过滤后的可见行：depth 0 为顶层。 */
export interface FlatRow {
  node: PickerNode;
  depth: number;
}

/** 把 id 列表构建为树：相同前缀合并为同一目录节点，子节点按名称混排排序。 */
export function buildTree(ids: readonly string[]): PickerNode[] {
  const roots: PickerNode[] = [];
  for (const id of ids) {
    const segments = id.split('/');
    let level = roots;
    let prefix = '';
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === undefined || segment === '') {
        throw new Error(`无效的条目路径: ${id}`);
      }
      const isLeaf = i === segments.length - 1;
      prefix = prefix ? `${prefix}/${segment}` : segment;
      const wantedType = isLeaf ? 'leaf' : 'dir';
      let node = level.find((n) => n.name === segment && n.type === wantedType);
      if (!node) {
        node = isLeaf
          ? { type: 'leaf', name: segment, path: id, children: [] }
          : { type: 'dir', name: segment, path: prefix, children: [] };
        level.push(node);
      }
      if (!isLeaf) level = node.children;
    }
  }
  sortLevel(roots);
  return roots;
}

function sortLevel(nodes: PickerNode[]): void {
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  for (const node of nodes) {
    if (node.type === 'dir') sortLevel(node.children);
  }
}

/**
 * 展开为可见行（深度优先，目录在后代之前）。
 * query 非空时按叶子完整路径做大小写不敏感的子串过滤；
 * 无匹配后代的目录被剪掉，有匹配后代的目录保留（自身名不匹配也保留）。
 */
export function flattenTree(roots: readonly PickerNode[], query = ''): FlatRow[] {
  const rows: FlatRow[] = [];
  const q = query.trim().toLowerCase();
  const walk = (nodes: readonly PickerNode[], depth: number): void => {
    for (const node of nodes) {
      if (node.type === 'leaf') {
        if (!q || node.path.toLowerCase().includes(q)) rows.push({ node, depth });
        continue;
      }
      const before = rows.length;
      walk(node.children, depth + 1);
      if (rows.length > before) rows.splice(before, 0, { node, depth });
    }
  };
  walk(roots, 0);
  return rows;
}

/** 节点下的全部叶子路径（先序）。 */
export function leafPaths(node: PickerNode): string[] {
  if (node.type === 'leaf') return [node.path];
  return node.children.flatMap(leafPaths);
}

export interface SelectionStats {
  picked: number;
  total: number;
}

export function selectionStats(node: PickerNode, selected: ReadonlySet<string>): SelectionStats {
  const leaves = leafPaths(node);
  return { picked: leaves.filter((p) => selected.has(p)).length, total: leaves.length };
}

export function checkState(node: PickerNode, selected: ReadonlySet<string>): CheckState {
  const { picked, total } = selectionStats(node, selected);
  if (total === 0 || picked === 0) return 'none';
  if (picked === total) return 'all';
  return 'partial';
}

/** 级联切换：叶子只影响自身；目录未全选 → 选中全部后代，已全选 → 清空后代。 */
export function toggleNode(node: PickerNode, selected: Set<string>): void {
  const leaves = leafPaths(node);
  const allSelected = leaves.every((p) => selected.has(p));
  for (const p of leaves) {
    if (allSelected) selected.delete(p);
    else selected.add(p);
  }
}

/** select all 行：未全选 → 选中全部叶子；已全选 → 清空。 */
export function toggleAll(roots: readonly PickerNode[], selected: Set<string>): void {
  toggleNode({ type: 'dir', name: '', path: '', children: [...roots] }, selected);
}
