import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { DsrReplyMatcher, StdinTap } from '../src/tree-picker.ts';

const ESC = String.fromCharCode(27);

describe('DsrReplyMatcher', () => {
  it('matches a reply arriving in a single chunk', () => {
    const matcher = new DsrReplyMatcher();
    expect(matcher.push(`${ESC}[24;80R`)).toEqual({ row: 24, swallow: true });
  });

  it('reassembles a reply split across two chunks', () => {
    const matcher = new DsrReplyMatcher();
    expect(matcher.push(`${ESC}[24;`)).toEqual({ row: null, swallow: true });
    expect(matcher.push('80R')).toEqual({ row: 24, swallow: true });
  });

  it('reassembles a reply split mid-number across three chunks', () => {
    const matcher = new DsrReplyMatcher();
    expect(matcher.push(`${ESC}[2`)).toEqual({ row: null, swallow: true });
    expect(matcher.push('4;8')).toEqual({ row: null, swallow: true });
    expect(matcher.push('0R')).toEqual({ row: 24, swallow: true });
  });

  it('still reports the reply after surrounding user bytes in one chunk', () => {
    const matcher = new DsrReplyMatcher();
    expect(matcher.push(`x${ESC}[3;5R`)).toEqual({ row: 3, swallow: true });
  });

  it('never swallows plain keystrokes', () => {
    const matcher = new DsrReplyMatcher();
    expect(matcher.push('a')).toEqual({ row: null, swallow: false });
    expect(matcher.push('80R')).toEqual({ row: null, swallow: false });
  });

  it('never swallows named CSI keys like arrows', () => {
    const matcher = new DsrReplyMatcher();
    expect(matcher.push(`${ESC}[A`)).toEqual({ row: null, swallow: false });
    // 拆开的箭头键：前缀吞掉（readline 此时尚未产生按键），补齐后放行
    expect(matcher.push(`${ESC}[`)).toEqual({ row: null, swallow: true });
    expect(matcher.push('B')).toEqual({ row: null, swallow: false });
  });

  it('keeps matching after a stale reply', () => {
    const matcher = new DsrReplyMatcher();
    expect(matcher.push(`${ESC}[1;1R`)).toEqual({ row: 1, swallow: true });
    expect(matcher.push(`${ESC}[2;2R`)).toEqual({ row: 2, swallow: true });
  });
});

describe('StdinTap', () => {
  it('routes data to the active handler and stops after detach', () => {
    const stream = new EventEmitter();
    const tap = new StdinTap(stream);
    const seen: string[] = [];
    const handler = { handleData: (chunk: string) => seen.push(chunk) };
    tap.attach(handler);
    stream.emit('data', 'a');
    expect(seen).toEqual(['a']);
    tap.detach(handler);
    stream.emit('data', 'b');
    expect(seen).toEqual(['a']);
  });

  it('decides suppression before stray keypresses fire', () => {
    const stream = new EventEmitter();
    const tap = new StdinTap(stream);
    const matcher = new DsrReplyMatcher();
    let suppress = false;
    tap.attach({
      handleData(chunk) {
        suppress = matcher.push(chunk).swallow;
      },
    });
    // 抑制标志在每个杂散按键产生时的取值：修复前（发射器先注册）这里是 false
    const flagAtKeypress: boolean[] = [];
    const chars: string[] = [];
    stream.on('keypress', (str: string | undefined) => {
      flagAtKeypress.push(suppress);
      if (str !== undefined) chars.push(str);
    });

    stream.emit('data', `${ESC}[24;80R`);
    // 应答字节被 readline 拆成 unknown + 'R' 两个杂散按键，必须在抑制窗口内
    expect(flagAtKeypress).toEqual([true, true]);
    expect(chars).toEqual(['R']);

    // 应答之后的正常输入不受影响
    stream.emit('data', 'x');
    expect(flagAtKeypress).toEqual([true, true, false]);
    expect(chars).toEqual(['R', 'x']);
  });

  it('relocates pre-existing data listeners behind its route', () => {
    const stream = new EventEmitter();
    const foreignSeen: string[] = [];
    const foreign = (chunk: Buffer | string) => {
      foreignSeen.push(String(chunk));
    };
    stream.on('data', foreign);
    // 模拟 clack 残留的发射器：先于 StdinTap 注册
    new StdinTap(stream);
    const listeners = stream.listeners('data');
    expect(listeners.length).toBe(2);
    expect(listeners[0]).not.toBe(foreign);
    expect(listeners).toContain(foreign);
    // 被挪位的监听仍然工作
    stream.emit('data', 'a');
    expect(foreignSeen).toEqual(['a']);
  });

  it('routes chunks to the latest attached handler only', () => {
    const stream = new EventEmitter();
    const tap = new StdinTap(stream);
    const first: string[] = [];
    const second: string[] = [];
    tap.attach({ handleData: (chunk) => first.push(chunk) });
    tap.attach({ handleData: (chunk) => second.push(chunk) });
    stream.emit('data', 'a');
    expect(first).toEqual([]);
    expect(second).toEqual(['a']);
  });
});
