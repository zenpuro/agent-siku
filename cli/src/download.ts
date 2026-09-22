import { type ExecFileException, execFile as execFileCb } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 单次 clone 的兜底超时；被 kill 时映射为超时错误。 */
const CLONE_TIMEOUT_MS = 300_000;

/** owner/repo 简写（无协议、无 @:，恰好一段斜杠）。 */
const SHORTHAND = /^[^\s/@:]+\/[^\s/:@]+$/;
const URL_FORM = /^https?:\/\/\S+$/i;
const SSH_URL = /^ssh:\/\/\S+$/i;
/** scp 风格：user@host:path。 */
const SCP_FORM = /^[^\s/]+@[^\s/:]+:\S+$/;

/** 测试注入用的最小 execFile 形状（Node 重载太宽，收窄到实际用到的部分）。 */
export type ExecFileLike = (
  file: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number },
  callback: (error: ExecFileException | null, stdout: string, stderr: string) => void,
) => void;

const defaultExec: ExecFileLike = (file, args, options, callback) => {
  execFileCb(file, args, options, callback);
};

export interface CloneOptions {
  /** Git 仓库地址（parseRepoUrl 的产物）。 */
  url: string;
  /** 分支或标签（浅克隆不支持 commit SHA）。 */
  ref: string;
  /**
   * 可选 token（CI 场景）：仅嵌入 https URL 的 basic-auth userinfo；
   * ssh URL 原样保留。交互场景不传——认证交给用户本机 git 体系。
   */
  token?: string;
}

export interface CloneDeps {
  execFileImpl?: ExecFileLike;
}

export interface CloneResult {
  /** clone 出的工作树根目录（临时目录，调用方负责清理）。 */
  dir: string;
  /** clone 后 HEAD 解析出的 commit SHA。 */
  sha: string;
}

/**
 * 把用户输入的仓库链接归一化为可直接 clone 的 git URL。
 * 裸 owner/repo 固定展开为 github.com（向后兼容）；https/ssh URL 与
 * git@host:path 原样透传（任意 Git 托管可用，子路径不裁剪——那需要
 * host 知识，交给 git 自然报错）。其余形式报错。
 */
export function parseRepoUrl(input: string): string {
  const trimmed = input
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const invalid = () =>
    new Error(
      `Invalid repo link: ${input} (expected owner/repo, a https/ssh git URL, or git@host:path)`,
    );
  if (trimmed === '' || input.includes('..') || input.trimStart().startsWith('-')) throw invalid();
  if (SHORTHAND.test(trimmed)) return `https://github.com/${trimmed}`;
  if (URL_FORM.test(trimmed) || SSH_URL.test(trimmed) || SCP_FORM.test(trimmed)) return trimmed;
  throw invalid();
}

/**
 * 用 git clone 拉取内容仓库到临时目录并返回解析出的 commit SHA。
 * --depth 1 --single-branch 只取单个 ref 的一次提交；ref 限分支/标签，
 * SHA 会得到远端明确报错（mapCloneError 转成可读提示）。
 * 认证完全委托 git（SSH key / credential helper / gh auth login）；
 * GIT_TERMINAL_PROMPT=0 确保凭据缺失时快速失败而非挂起等输入。
 * 失败时清理临时目录；错误信息经过脱敏，不回显 token。
 */
export async function cloneContent(
  options: CloneOptions,
  deps: CloneDeps = {},
): Promise<CloneResult> {
  const { url, ref } = options;
  if (url.startsWith('-') || /\s/.test(url)) {
    throw new Error(`Invalid repo URL: ${url}`);
  }
  if (ref.startsWith('-') || ref.startsWith('/') || /\s/.test(ref) || ref.includes('..')) {
    throw new Error(`Invalid ref: ${ref} (expected a branch or tag name)`);
  }

  const exec = deps.execFileImpl ?? defaultExec;
  const dir = mkdtempSync(join(tmpdir(), 'siku-content-'));
  const cloneUrl = options.token ? embedToken(url, options.token) : url;
  try {
    await runGit(
      exec,
      ['clone', '--depth', '1', '--single-branch', '--branch', ref, cloneUrl, dir],
      {
        timeout: CLONE_TIMEOUT_MS,
      },
    );
    const { stdout } = await runGit(exec, ['rev-parse', 'HEAD'], { cwd: dir });
    return { dir, sha: stdout.trim() };
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw mapCloneError(err, ref, options.token);
  }
}

function runGit(
  exec: ExecFileLike,
  args: string[],
  options: { cwd?: string; timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    exec('git', args, { ...options, env }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/** 仅 https URL 嵌入 basic-auth userinfo；token 可能随 git 报错出现，mapCloneError 统一脱敏。 */
function embedToken(url: string, token: string): string {
  return url.replace(/^(https?:\/\/)(?!.*@)/i, `$1x-access-token:${token}@`);
}

function mapCloneError(err: unknown, ref: string, token?: string): Error {
  const e = err as ExecFileException & { stderr?: string };
  if (e.code === 'ENOENT') {
    return new Error(
      'git not found in PATH — siku fetches content via git clone, install git first',
    );
  }
  if (e.killed) {
    return new Error(`git clone timed out (ref ${ref}) after ${CLONE_TIMEOUT_MS / 1000}s`);
  }
  const detail = token ? (e.stderr ?? e.message).replaceAll(token, '***') : (e.stderr ?? e.message);
  const text = detail.trim() || e.message;
  if (/authentication failed|could not read Username|terminal prompts disabled/i.test(text)) {
    return new Error(
      `git clone failed — repository requires authentication. Set up git auth (gh auth login, an SSH key, or a credential helper), or set SIKU_TOKEN / GITHUB_TOKEN for CI. (${text})`,
    );
  }
  if (/not found in upstream origin/i.test(text)) {
    return new Error(
      `Ref '${ref}' not found in the remote — shallow clone supports branches and tags only, not commit SHAs. (${text})`,
    );
  }
  return new Error(`git clone failed for ref ${ref}: ${text}`);
}
