import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS_MD_END, AGENTS_MD_START } from './constants.ts';
import type { InstallScope } from './types.ts';

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
    writeFileSync(targetFile, markedBlock(content));
    return 'written';
  }
  if (conflict === 'overwrite') {
    writeFileSync(targetFile, markedBlock(content));
    return 'overwritten';
  }

  const existing = readFileSync(targetFile, 'utf8');
  writeFileSync(targetFile, mergeMarkedBlock(existing, content));
  return 'appended';
}

/** 追加语义：已有标记区块则原位替换（幂等），否则追加到文件尾部。 */
export function mergeMarkedBlock(existing: string, content: string): string {
  const pattern = new RegExp(
    `${escapeRegExp(AGENTS_MD_START)}[\\s\\S]*?${escapeRegExp(AGENTS_MD_END)}`,
  );
  if (pattern.test(existing)) {
    // 用函数替换，避免 content 中的 $&、$` 等被 String.replace 当作特殊序列展开
    return existing.replace(pattern, () => markedBlock(content).trimEnd());
  }
  return `${existing.trimEnd()}\n\n${markedBlock(content)}`;
}

/** 把内容包上 siku 标记，输出以换行结尾的完整区块。 */
function markedBlock(content: string): string {
  return `${AGENTS_MD_START}\n${content}\n${AGENTS_MD_END}\n`;
}

/** 返回本次安装需要写入的上下文文件列表。 */
export function agentsMdTargets(
  scope: InstallScope,
  rootDir: string,
  hasClaude: boolean,
): string[] {
  if (scope === 'project') return [join(rootDir, 'AGENTS.md')];
  const targets = [join(rootDir, '.agents', 'AGENTS.md')];
  if (hasClaude) targets.push(join(rootDir, '.claude', 'CLAUDE.md'));
  return targets;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
