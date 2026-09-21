import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentConfig, AgentId } from './types.ts';

/** agent 注册表：新增 agent 时在此加一项 + AgentId 联合类型加一个成员。 */
export const agents: Record<AgentId, AgentConfig> = {
  'claude-code': {
    id: 'claude-code',
    displayName: 'Claude Code',
    generateClaudeArtifacts: true,
  },
  pi: { id: 'pi', displayName: 'Pi', generateClaudeArtifacts: false },
  zcode: { id: 'zcode', displayName: 'ZCode', generateClaudeArtifacts: false },
};

/** 交互列表的固定展示顺序。 */
export const agentOrder: readonly AgentId[] = ['claude-code', 'pi', 'zcode'];

export function getAgentConfig(id: AgentId): AgentConfig {
  return agents[id];
}

/**
 * 探测本机已安装的 agent（仅用于交互预选，不阻断选择）。
 * home 与 exists 可注入以便测试。
 */
export function detectInstalledAgents(
  home: string = homedir(),
  exists: (path: string) => boolean = existsSync,
): AgentId[] {
  const probes: ReadonlyArray<readonly [AgentId, string]> = [
    ['claude-code', join(home, '.claude')],
    ['pi', join(home, '.pi', 'agent')],
    ['zcode', join(home, '.zcode')],
  ];
  return probes.filter(([, path]) => exists(path)).map(([id]) => id);
}
