import { emitKeypressEvents, type Key } from 'node:readline';
import pc from 'picocolors';
import {
  type CheckState,
  checkState,
  type FlatRow,
  flattenTree,
  leafPaths,
  type PickerNode,
  selectionStats,
  toggleAll,
  toggleNode,
} from './tree.ts';

/** 用户中断多选（esc / ctrl+c）。 */
export const PICKER_CANCEL = Symbol('siku-picker-cancel');

export interface TreePickerOptions {
  message: string;
  /** 顶层节点（buildTree 的产物）。 */
  roots: readonly PickerNode[];
}

const HELP = '↑/↓ move · space select · type to filter · enter confirm · esc cancel';

/** ANSI CSI 序列（如颜色码、光标移动）。控制字符用运行时拼接，绕开正则字面量限制。 */
const ESC = String.fromCharCode(27);
const ANSI_SEQUENCE = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`);
const ANSI_SEQUENCE_GLOBAL = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g');
/** DSR（设备状态报告）应答：\x1b[<row>;<col>R（不锚定，容忍同 chunk 里的相邻字节）。 */
const DSR_REPLY = new RegExp(`${ESC}\\[(\\d+);\\d+R`);

type VisibleRow = { kind: 'all'; depth: 0; node?: undefined } | ({ kind: 'node' } & FlatRow);

/** ANSI 转义不占列宽：按可见字符数截断（样式保留，结尾补 reset）。 */
function truncateVisible(s: string, max: number): string {
  let out = '';
  let width = 0;
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const ansi = ANSI_SEQUENCE.exec(rest);
    const plainEnd = ansi ? ansi.index : rest.length;
    for (let j = 0; j < plainEnd; j++) {
      if (width >= max) return `${out}\x1b[0m`;
      out += rest[j];
      width++;
    }
    i += plainEnd;
    if (ansi) {
      out += ansi[0];
      i += ansi[0].length;
    }
  }
  return `${out}\x1b[0m`;
}

function visibleLength(s: string): number {
  return s.replace(ANSI_SEQUENCE_GLOBAL, '').length;
}

class TreePicker {
  private readonly message: string;
  private readonly roots: readonly PickerNode[];
  private readonly allLeaves: string[];
  private readonly selected = new Set<string>();
  private readonly wasRaw: boolean;
  private readonly resolve: (value: string[] | typeof PICKER_CANCEL) => void;

  private query = '';
  private rows: VisibleRow[] = [];
  private cursor = 0;
  private winStart = 0;
  private widths: number[] = [];
  /** 帧顶的绝对行号（DSR 查询得到；未知时退回相对清除）。 */
  private frameTop: number | null = null;
  private pendingDsr = false;
  private awaitingRelocate = false;
  /** 渲染次数：DSR 应答期间发生过渲染，应答即过期。 */
  private epoch = 0;
  private queryEpoch = 0;
  /** DSR 应答会被 readline 拆成杂散按键，同一轮 tick 内全部吞掉。 */
  private suppressKeys = false;
  private resizeTimer: NodeJS.Timeout | undefined;
  private dsrTimer: NodeJS.Timeout | undefined;
  private done = false;

  constructor(
    options: TreePickerOptions,
    resolve: (value: string[] | typeof PICKER_CANCEL) => void,
  ) {
    this.message = options.message;
    this.roots = options.roots;
    this.allLeaves = options.roots.flatMap(leafPaths);
    this.resolve = resolve;
    this.wasRaw = process.stdin.isRaw === true;

    this.rebuildRows();
    // data 监听必须先于 emitKeypressEvents：DSR 应答的原始字节要先到这里。
    process.stdin.on('data', this.onData);
    emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', this.onKeypress);
    process.stdout.on('resize', this.onResize);
    process.stdout.write('\x1b[?25l');
    this.render(false);
    this.queryDsr(false);
  }

  /**
   * DSR 应答（\x1b[<row>;<col>R）从原始 stdin 字节中捕获。
   * readline 会把同一串字节拆成杂散按键（unknown + 'r'），
   * 因此捕获到应答后在同一轮 tick 内吞掉所有按键事件。
   */
  private readonly onData = (chunk: Buffer | string): void => {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const m = DSR_REPLY.exec(text);
    if (!m || !this.pendingDsr) return;
    this.pendingDsr = false;
    this.suppressKeys = true;
    process.nextTick(() => {
      this.suppressKeys = false;
    });
    if (this.dsrTimer !== undefined) {
      clearTimeout(this.dsrTimer);
      this.dsrTimer = undefined;
    }
    // 应答期间发生过渲染：行号基准已变，应答过期，丢弃。
    if (this.queryEpoch !== this.epoch) return;
    const reportedRow = Number.parseInt(m[1] ?? '1', 10);
    this.frameTop = Math.max(1, reportedRow - this.physicalRows() + 1);
    if (this.awaitingRelocate) {
      this.awaitingRelocate = false;
      this.render(true);
      this.queryDsr(false);
    }
  };

  private readonly onKeypress = (str: string | undefined, key: Key): void => {
    if (this.suppressKeys) return;
    if (key.ctrl && key.name === 'c') {
      this.finish(null);
      return;
    }
    if (key.name === 'escape') {
      this.finish(null);
      return;
    }
    switch (key.name) {
      case 'up':
        this.move(-1);
        return;
      case 'down':
        this.move(1);
        return;
      case 'space':
        this.toggleCurrent();
        return;
      case 'return':
      case 'enter':
        this.finish([...this.selected]);
        return;
      case 'backspace':
        if (this.query.length > 0) {
          this.query = this.query.slice(0, -1);
          this.refilter();
        }
        return;
      default:
        break;
    }
    if (str === undefined || key.ctrl || key.meta) return;
    if (str.length === 1 && str.charCodeAt(0) >= 32) {
      this.query += str;
      this.refilter();
    }
  };

  private readonly onResize = (): void => {
    if (this.resizeTimer !== undefined) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = undefined;
      if (this.widths.length === 0) return;
      // 终端 reflow 可能让旧帧移位：先 DSR 重新定位帧顶，再清除重绘。
      this.clampWindow();
      this.queryDsr(true);
    }, 60);
    this.resizeTimer.unref?.();
  };

  private queryDsr(relocate: boolean): void {
    this.pendingDsr = true;
    this.awaitingRelocate = relocate;
    this.queryEpoch = this.epoch;
    // 终端不响应 DSR 时的兜底：放弃等待；若在等待 relocate 则退回相对清除重绘。
    this.dsrTimer = setTimeout(() => {
      this.dsrTimer = undefined;
      if (!this.pendingDsr) return;
      this.pendingDsr = false;
      if (!this.awaitingRelocate) return;
      this.awaitingRelocate = false;
      this.frameTop = null;
      this.render(true);
    }, 250);
    this.dsrTimer.unref?.();
    process.stdout.write('\x1b[6n');
  }

  private physicalRows(): number {
    const cols = Math.max(1, process.stdout.columns ?? 80);
    return this.widths.reduce((sum, w) => sum + Math.max(1, Math.ceil(w / cols)), 0);
  }

  private clearFrame(): void {
    if (this.widths.length === 0) return;
    const out = process.stdout;
    if (this.frameTop !== null) {
      out.write(`\x1b[${this.frameTop};1H\x1b[J`);
      return;
    }
    const up = this.physicalRows() - 1;
    if (up > 0) out.write(`\x1b[${up}A`);
    out.write('\r\x1b[J');
  }

  private render(withClear: boolean): void {
    this.epoch++;
    const lines = this.buildLines();
    if (withClear) this.clearFrame();
    this.widths = lines.map(visibleLength);
    process.stdout.write(lines.join('\n'));
  }

  private buildLines(): string[] {
    const cols = Math.max(10, (process.stdout.columns ?? 80) - 1);
    const lines: string[] = [];
    const push = (s: string): void => {
      lines.push(truncateVisible(s, cols));
    };

    push(`${pc.cyan('◆')} ${this.message}`);
    push(`${pc.dim('│')} ${pc.dim('Search: ')}${this.query}${pc.dim('▊')}`);

    const total = this.rows.length;
    const cap = this.viewCap();
    const end = Math.min(total, this.winStart + cap);
    if (this.winStart > 0) {
      push(`${pc.dim('│')}   ${pc.dim(`↑ ${this.winStart} more`)}`);
    }
    for (let i = this.winStart; i < end; i++) push(this.renderRow(i));
    if (end < total) push(`${pc.dim('│')}   ${pc.dim(`↓ ${total - end} more`)}`);
    if (total === 1) push(`${pc.dim('│')}   ${pc.dim('(no matches)')}`);
    push(`${pc.dim('└')} ${pc.dim(HELP)}`);
    return lines;
  }

  private renderRow(i: number): string {
    const row = this.rows[i];
    if (!row) return '';
    const caret = i === this.cursor ? pc.cyan('❯') : ' ';
    const depth = '  '.repeat(row.depth);
    if (row.kind === 'all') {
      const box = this.box(this.allState());
      const count = pc.dim(`(${this.selected.size}/${this.allLeaves.length})`);
      return `${pc.dim('│')} ${caret} ${box} ${depth}${pc.bold('select all')} ${count}`;
    }
    const box = this.box(this.stateOf(row.node));
    const head = `${pc.dim('│')} ${caret} ${box} ${depth}${row.node.name}`;
    if (row.node.type === 'dir') {
      const { picked, total } = selectionStats(row.node, this.selected);
      return `${head} ${pc.dim(`(${picked}/${total})`)}`;
    }
    return head;
  }

  private box(state: CheckState): string {
    if (state === 'all') return pc.green('◼');
    if (state === 'partial') return pc.cyan('▣');
    return '▢';
  }

  private stateOf(node: PickerNode): CheckState {
    if (node.type === 'dir') return checkState(node, this.selected);
    return this.selected.has(node.path) ? 'all' : 'none';
  }

  private allState(): CheckState {
    if (this.selected.size === 0) return 'none';
    if (this.selected.size >= this.allLeaves.length) return 'all';
    return 'partial';
  }

  private viewCap(): number {
    const rows = process.stdout.rows ?? 24;
    return Math.max(4, rows - 6);
  }

  private rebuildRows(): void {
    const flat = flattenTree(this.roots, this.query).map<VisibleRow>((r) => ({
      kind: 'node',
      depth: r.depth + 1,
      node: r.node,
    }));
    this.rows = [{ kind: 'all', depth: 0 }, ...flat];
  }

  private clampWindow(): void {
    const last = this.rows.length - 1;
    if (this.cursor > last) this.cursor = Math.max(0, last);
    if (this.cursor < 0) this.cursor = 0;
    const cap = this.viewCap();
    if (this.winStart > this.cursor) this.winStart = this.cursor;
    const minStart = Math.max(0, this.cursor - cap + 1);
    if (this.winStart < minStart) this.winStart = minStart;
    this.winStart = Math.min(this.winStart, Math.max(0, this.rows.length - cap));
  }

  private refilter(): void {
    this.rebuildRows();
    this.cursor = 0;
    this.winStart = 0;
    this.render(true);
  }

  private move(delta: number): void {
    this.cursor = Math.min(Math.max(this.cursor + delta, 0), this.rows.length - 1);
    this.clampWindow();
    this.render(true);
  }

  private toggleCurrent(): void {
    const row = this.rows[this.cursor];
    if (!row) return;
    if (row.kind === 'all') toggleAll(this.roots, this.selected);
    else toggleNode(row.node, this.selected);
    this.render(true);
  }

  private finish(result: string[] | null): void {
    if (this.done) return;
    this.done = true;
    if (this.resizeTimer !== undefined) clearTimeout(this.resizeTimer);
    if (this.dsrTimer !== undefined) clearTimeout(this.dsrTimer);
    process.stdin.removeListener('data', this.onData);
    process.stdin.removeListener('keypress', this.onKeypress);
    process.stdout.removeListener('resize', this.onResize);
    if (process.stdin.isTTY) process.stdin.setRawMode(this.wasRaw);
    this.clearFrame();
    if (result === null) {
      process.stdout.write('\x1b[?25h');
      this.resolve(PICKER_CANCEL);
      return;
    }
    process.stdout.write(
      `${pc.cyan('◆')} ${this.message}\n${pc.dim('└')} ${pc.green('✔')} ${result.length} selected\n\x1b[?25h`,
    );
    this.resolve(result);
  }
}

/**
 * 树形多选：select all + 任意深度目录（含计数与级联选择）+ 叶子，
 * 支持输入过滤；返回选中的叶子完整路径。
 * 渲染自管理帧清除（相对行数 + resize 时 DSR 绝对定位），终端改尺寸不走样。
 */
export function treeMultiselect(
  options: TreePickerOptions,
): Promise<string[] | typeof PICKER_CANCEL> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error('Interactive selection requires a TTY.'));
  }
  return new Promise((resolve) => {
    new TreePicker(options, resolve);
  });
}
