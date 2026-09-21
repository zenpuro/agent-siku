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
import { DEFAULT_REF, DEFAULT_REPO, VERSION } from './constants.ts';
import { buildManifest } from './content.ts';
import { downloadContent } from './download.ts';
import { applyInstall, planInstall } from './installer.ts';
import { buildLockFile, writeLockFile } from './lock.ts';
import {
  promptAgents,
  promptAgentsMdConflict,
  promptInjectAgentsMd,
  promptRules,
  promptScope,
  promptSkills,
} from './prompts.ts';
import type { AgentId, InstallPlan, RuleInfo, SkillInfo } from './types.ts';

const HELP = `siku — 把集中维护的 skills / rules / AGENTS.md 安装到任意项目或用户环境

用法:
  siku install [options]    交互式安装（内容安装的唯一入口）
  siku --help               显示本帮助
  siku --version            显示版本

siku install options:
  --project                 安装到当前项目（跳过范围选择）
  --user                    安装到用户环境 ~（跳过范围选择）
  --repo <owner/repo>       内容仓库（默认 ${DEFAULT_REPO}，可被 SIKU_REPO 覆盖）
  --ref <ref>               内容分支或标签（默认 ${DEFAULT_REF}）
  --source <dir>            直读本地内容目录（开发用，离线，跳过下载）
  --help, -h                显示本帮助

安装目标:
  skills  始终写入 .agents/skills/；选择 claude code 时同时复制到 .claude/skills/
  rules   仅选择 claude code 时写入 .claude/rules/
  agents-md  项目安装生成 AGENTS.md；用户安装生成 ~/.agents/AGENTS.md（claude code 另生成 CLAUDE.md）
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
    throw new Error('--project 与 --user 只能指定一个');
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
  clack.intro(`siku v${VERSION} — agent 内容安装器`);

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
      throw new Error(`本地内容目录无效（缺少 skills/、rules/ 或 agents-md/）: ${contentRoot}`);
    }
    lockSource = { repo: `(local) ${basename(contentRoot)}`, ref: 'local' };
    clack.log.info(`使用本地内容源: ${contentRoot}`);
  } else {
    const repo = flags.repo ?? process.env.SIKU_REPO ?? DEFAULT_REPO;
    const ref = flags.ref ?? DEFAULT_REF;
    const spinner = clack.spinner();
    spinner.start(`从 ${repo}@${ref} 拉取内容...`);
    contentRoot = await downloadContent({ repo, ref });
    spinner.stop('内容下载完成');
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
      throw new Error('内容源为空：未发现任何 skills / rules / agents-md');
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
      clack.outro('未选择任何内容，退出。');
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
      `skills: ${result.plan.skillTargets.length} 个目标（${skills.length} 个技能）`,
      `rules: ${result.plan.ruleTargets.length} 个文件`,
      `agents-md: ${inject ? result.mdTargets.join('、') : '未注入'}`,
      `lock: ${result.lockPath}`,
    ];
    clack.note(lines.join('\n'), '安装完成');
    clack.outro('完成。重启 agent 后生效。');
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
    console.error(`未知命令: ${cmd}\n`);
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
