import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AGENTS_MD_END, AGENTS_MD_START } from './constants.ts';

export type AgentsMdConflict = 'overwrite' | 'append' | 'skip';
export type AgentsMdResult = 'written' | 'overwritten' | 'appended' | 'skipped';

/** 把 agents-md/ 下的文件按顺序拼接为注入内容（去尾部空白，双换行分隔）。 */
export function buildAgentsMdContent(files: readonly string[]): string {
  return files.map((f) => readFileSync(f, 'utf8').trimEnd()).join('\n\n');
}

/**
 * 把内容写入目标上下文文件（AGENTS.md / CLAUDE.md）。
 * - 目标不存在：直接生成
 * - overwrite：整体覆盖
 * - append：以标记区块追加；区块已存在时原位替换（幂等）
 * - skip：不动文件
 */
export function applyAgentsMd(
  targetFile: string,
  content: string,
  conflict: AgentsMdConflict,
): AgentsMdResult {
  if (conflict === 'skip') return 'skipped';

  if (!existsSync(targetFile)) {
    writeFileSync(targetFile, `${content}\n`);
    return 'written';
  }
  if (conflict === 'overwrite') {
    writeFileSync(targetFile, `${content}\n`);
    return 'overwritten';
  }

  const existing = readFileSync(targetFile, 'utf8');
  writeFileSync(targetFile, mergeMarkedBlock(existing, content));
  return 'appended';
}

/** 追加语义：已有标记区块则原位替换（幂等），否则追加到文件尾部。 */
export function mergeMarkedBlock(existing: string, content: string): string {
  const block = `${AGENTS_MD_START}\n${content}\n${AGENTS_MD_END}`;
  const pattern = new RegExp(
    `${escapeRegExp(AGENTS_MD_START)}[\\s\\S]*?${escapeRegExp(AGENTS_MD_END)}`,
  );
  if (pattern.test(existing)) {
    return existing.replace(pattern, block);
  }
  return `${existing.trimEnd()}\n\n${block}\n`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
