import { parseArgs } from 'node:util';
import { DEFAULT_REF, DEFAULT_REPO, VERSION } from './constants.ts';

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

export async function runInstall(_flags: InstallFlags): Promise<void> {
  // 完整安装流程在 Task 9 接入（下载/发现 → 交互 → 安装 → lock → 摘要）。
  console.log('安装流程尚未接入。');
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
