import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as clack from '@clack/prompts';
import { detectInstalledAgents } from './agents.ts';
import {
  type AgentsMdConflict,
  agentsMdTargets,
  applyAgentsMd,
  buildAgentsMdContent,
} from './agents-md.ts';
import { DEFAULT_REF, VERSION } from './constants.ts';
import { buildManifest } from './content.ts';
import { downloadContent, parseRepoInput } from './download.ts';
import { applyInstall, planInstall } from './installer.ts';
import { buildLockFile, writeLockFile } from './lock.ts';
import {
  promptAgents,
  promptAgentsMdConflict,
  promptInjectAgentsMd,
  promptRepo,
  promptRules,
  promptScope,
  promptSkills,
  promptToken,
} from './prompts.ts';
import type { AgentId, InstallPlan, RuleInfo, SkillInfo } from './types.ts';

const HELP = `siku — install centrally-maintained skills / rules / AGENTS.md into any project or user environment

Usage:
  siku install [options]    Interactive install (the only entry to content install)
  siku --help               Show this help
  siku --version            Show version

siku install options:
  --project                 Install into the current project (skips scope prompt)
  --user                    Install into user home ~ (skips scope prompt)
  --repo <link>             Content repo link — required unless --source
                            (owner/repo, https://github.com/owner/repo, or git@github.com:owner/repo.git;
                            falls back to SIKU_REPO env, then interactive prompt)
  --ref <ref>               Content branch or tag (default ${DEFAULT_REF})
  --source <dir>            Read a local content directory directly (dev, offline, skips download)
  --help, -h                Show this help

Private repos:
  Set SIKU_TOKEN or GITHUB_TOKEN to a token with repo read access,
  or you will be prompted for one when the repo requires auth.

Install targets:
  skills     Always written to .agents/skills/; duplicated to .claude/skills/ when Claude Code is selected
  rules      Written to .claude/rules/ only when Claude Code is selected
  agents-md  Project install generates AGENTS.md; user install generates ~/.agents/AGENTS.md (plus CLAUDE.md for Claude Code)
`;

export interface InstallFlags {
  project: boolean;
  user: boolean;
  repo?: string;
  ref?: string;
  source?: string;
}

export function parseInstallArgs(args: string[]): InstallFlags {
  const { values } = parseArgs({
    args,
    options: {
      project: { type: 'boolean', default: false },
      user: { type: 'boolean', default: false },
      repo: { type: 'string' },
      ref: { type: 'string' },
      source: { type: 'string' },
    },
  });
  const flags: InstallFlags = {
    project: values.project === true,
    user: values.user === true,
    repo: typeof values.repo === 'string' ? values.repo : undefined,
    ref: typeof values.ref === 'string' ? values.ref : undefined,
    source: typeof values.source === 'string' ? values.source : undefined,
  };
  if (flags.project && flags.user) {
    throw new Error('--project and --user are mutually exclusive');
  }
  return flags;
}

/** 收集完全部选择后，一次安装的完整输入（与交互解耦，可直接测试）。 */
export interface PerformInstallInput {
  contentRoot: string;
  lockSource: { repo: string; ref: string };
  scope: 'project' | 'user';
  rootDir: string;
  agents: AgentId[];
  skills: SkillInfo[];
  rules: RuleInfo[];
  agentsMd: { inject: boolean; conflict: AgentsMdConflict };
}

export interface PerformInstallResult {
  plan: InstallPlan;
  mdTargets: string[];
  lockPath: string;
}

/** 安装核心：计划 → 复制 → 上下文文件 → lock。不做任何交互。 */
export function performInstall(input: PerformInstallInput): PerformInstallResult {
  const manifest = buildManifest(input.contentRoot);
  const plan = planInstall(input.rootDir, input.agents, {
    skills: input.skills,
    rules: input.rules,
    injectAgentsMd: input.agentsMd.inject,
  });
  applyInstall(plan);

  const mdTargets = input.agentsMd.inject
    ? agentsMdTargets(input.scope, input.rootDir, input.agents.includes('claude-code'))
    : [];
  if (input.agentsMd.inject) {
    const mdContent = buildAgentsMdContent(manifest.agentsMdFiles);
    for (const target of mdTargets) {
      applyAgentsMd(target, mdContent, input.agentsMd.conflict);
    }
  }

  const lock = buildLockFile(input.lockSource, plan, input.agentsMd.inject);
  const lockPath = writeLockFile(input.rootDir, lock);
  return { plan, mdTargets, lockPath };
}

export async function runInstall(flags: InstallFlags): Promise<void> {
  clack.intro(`siku v${VERSION} — agent content installer`);

  // 1. 解析内容源：本地目录或 GitHub 远端
  let contentRoot: string;
  let cleanup = (): void => {};
  let lockSource: { repo: string; ref: string };
  if (flags.source) {
    contentRoot = resolve(flags.source);
    if (
      !existsSync(join(contentRoot, 'skills')) &&
      !existsSync(join(contentRoot, 'rules')) &&
      !existsSync(join(contentRoot, 'agents-md'))
    ) {
      throw new Error(
        `Invalid local content directory (missing skills/, rules/ or agents-md/): ${contentRoot}`,
      );
    }
    lockSource = { repo: `(local) ${basename(contentRoot)}`, ref: 'local' };
    clack.log.info(`Using local content source: ${contentRoot}`);
  } else {
    // 仓库链接必传：flag > SIKU_REPO > 交互询问，无内置默认
    const repoInput = flags.repo ?? process.env.SIKU_REPO;
    const repo = parseRepoInput(repoInput ?? (await promptRepo()));
    const ref = flags.ref ?? DEFAULT_REF;
    const token = process.env.SIKU_TOKEN ?? process.env.GITHUB_TOKEN;
    const spinner = clack.spinner();
    spinner.start(`Fetching content from ${repo}@${ref}...`);
    contentRoot = await downloadContent({ repo, ref, token }, { promptToken });
    spinner.stop('Content downloaded');
    lockSource = { repo, ref };
    cleanup = () => rmSync(contentRoot, { recursive: true, force: true });
  }

  try {
    // 2. 发现内容
    const manifest = buildManifest(contentRoot);
    if (
      manifest.skills.length === 0 &&
      manifest.rules.length === 0 &&
      manifest.agentsMdFiles.length === 0
    ) {
      throw new Error('Content source is empty: no skills / rules / agents-md found');
    }

    // 3. 交互选择
    const scope = await promptScope(flags.project ? 'project' : flags.user ? 'user' : undefined);
    const rootDir = scope === 'project' ? process.cwd() : homedir();
    const agents = await promptAgents(detectInstalledAgents());
    const hasClaude = agents.includes('claude-code');
    const skills = await promptSkills(manifest.skills);
    const rules = await promptRules(manifest.rules, hasClaude);

    const inject = await promptInjectAgentsMd();
    const mdTargets = agentsMdTargets(scope, rootDir, hasClaude);
    let conflict: AgentsMdConflict | false = false;
    if (inject) {
      conflict = await promptAgentsMdConflict(mdTargets.some((f) => existsSync(f)));
    }

    if (skills.length === 0 && rules.length === 0 && !inject) {
      clack.outro('Nothing selected — exiting.');
      return;
    }

    // 4. 执行安装核心
    const result = performInstall({
      contentRoot,
      lockSource,
      scope,
      rootDir,
      agents,
      skills,
      rules,
      agentsMd: { inject, conflict: conflict === false ? 'skip' : conflict },
    });
    for (const warning of result.plan.warnings) clack.log.warn(warning);

    // 5. 摘要
    const lines = [
      `skills: ${result.plan.skillTargets.length} target dirs (${skills.length} skills)`,
      `rules: ${result.plan.ruleTargets.length} files`,
      `agents-md: ${inject ? result.mdTargets.join(', ') : 'not injected'}`,
      `lock: ${result.lockPath}`,
    ];
    clack.note(lines.join('\n'), 'Install complete');
    clack.outro('Done. Restart your agent to pick up the changes.');
  } finally {
    cleanup();
  }
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }
  if (cmd === '--version' || cmd === '-v') {
    console.log(VERSION);
    return;
  }
  if (cmd !== 'install') {
    console.error(`Unknown command: ${cmd}\n`);
    console.log(HELP);
    process.exitCode = 1;
    return;
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    console.log(HELP);
    return;
  }
  await runInstall(parseInstallArgs(rest));
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
