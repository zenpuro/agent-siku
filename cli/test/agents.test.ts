import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agents, agentOrder, detectInstalledAgents, getAgentConfig } from '../src/agents.ts';

describe('agent registry', () => {
  it('covers every AgentId in display order', () => {
    expect(agentOrder).toEqual(['claude-code', 'pi', 'zcode']);
    for (const id of agentOrder) {
      expect(agents[id], `missing config for ${id}`).toBeDefined();
      expect(agents[id].displayName.length).toBeGreaterThan(0);
    }
  });

  it('only claude-code generates .claude artifacts', () => {
    expect(getAgentConfig('claude-code').generateClaudeArtifacts).toBe(true);
    expect(getAgentConfig('pi').generateClaudeArtifacts).toBe(false);
    expect(getAgentConfig('zcode').generateClaudeArtifacts).toBe(false);
  });
});

describe('detectInstalledAgents', () => {
  const home = join('C:', 'Users', 'fake');

  it('detects agents by their home marker dirs', () => {
    const piDir = join(home, '.pi', 'agent');
    const found = detectInstalledAgents(home, (p) => p === join(home, '.claude') || p === piDir);
    expect(found).toEqual(['claude-code', 'pi']);
  });

  it('returns empty when nothing installed', () => {
    expect(detectInstalledAgents(home, () => false)).toEqual([]);
  });
});
