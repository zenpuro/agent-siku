import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract as tarExtract } from 'tar';

const REPO_SLUG = /^[^\s/]+\/[^\s/]+$/;
const GITHUB_URL = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i;
const GITHUB_SSH = /^git@github\.com:(.+)$/i;

/** tar 解压所需的最小选项集（结构化类型，避免耦合 tar 的类型导出）。 */
interface ExtractCall {
  file: string;
  cwd: string;
  strip?: number;
}

export interface RemoteContentOptions {
  /** GitHub 仓库，owner/repo 形式。 */
  repo: string;
  /** 分支、标签或 SHA，默认 main。 */
  ref: string;
  /** GitHub token（私有仓库认证），以 Bearer 方式随请求发送。 */
  token?: string;
}

export interface DownloadDeps {
  fetchImpl?: typeof fetch;
  extract?: (options: ExtractCall) => Promise<void>;
  /** 404 且未携带 token 时调用（私有仓库不提示则不可见）；返回空值表示放弃。 */
  promptToken?: () => Promise<string | undefined>;
}

/**
 * 把用户输入的仓库链接归一化为 owner/repo slug。
 * 接受 owner/repo、https://github.com/owner/repo（可带 .git、尾斜杠）与
 * git@github.com:owner/repo.git；其余形式报错。
 */
export function parseRepoInput(input: string): string {
  const trimmed = input.trim().replace(/\.git$/i, '');
  const matched = trimmed.match(GITHUB_URL) ?? trimmed.match(GITHUB_SSH);
  const slug = (matched?.[1] ?? trimmed).replace(/^\/+|\/+$/g, '');
  if (!REPO_SLUG.test(slug)) {
    throw new Error(`Invalid repo link: ${input} (expected owner/repo or a github.com repo URL)`);
  }
  return slug;
}

/**
 * 从 GitHub API 拉取内容仓库 tarball 并解压到临时目录。
 * 使用 /repos/{repo}/tarball/{ref} 端点：分支、标签、SHA 通吃，且携带
 * Authorization 时可访问私有仓库（codeload 不支持认证）。未带 token 收到 404
 * 时先经 deps.promptToken 询问一次再重试——GitHub 对无权限的私有仓库同样返回 404。
 * tar 包默认行为已拒绝绝对路径与越出解压目录的条目，叠加 strip:1 剥离顶层目录。
 * 返回解压后的内容根目录，调用方负责用后清理。
 */
export async function downloadContent(
  options: RemoteContentOptions,
  deps: DownloadDeps = {},
): Promise<string> {
  const { repo, ref } = options;
  if (!REPO_SLUG.test(repo)) {
    throw new Error(`Invalid repo id: ${repo} (expected owner/repo)`);
  }
  if (repo.includes('..') || ref.includes('..') || ref.startsWith('/')) {
    throw new Error('repo/ref contains illegal characters');
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const extract = deps.extract ?? ((o: ExtractCall) => tarExtract(o));
  const url = `https://api.github.com/repos/${repo}/tarball/${encodeURIComponent(ref)}`;

  let token = options.token;
  for (;;) {
    const headers: Record<string, string> = { 'User-Agent': 'siku' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(url, { headers, redirect: 'follow' });
    if (res.status === 404) {
      if (!token && deps.promptToken) {
        token = await deps.promptToken();
        if (token) continue;
      }
      throw new Error(
        `Content source not found: ${repo}@${ref} (ref may not exist, or the repo is private${
          token ? ' and the token cannot access it' : ''
        })`,
      );
    }
    if (!res.ok) {
      throw new Error(`Download failed (HTTP ${res.status}): ${url}`);
    }
    const tarball = Buffer.from(await res.arrayBuffer());
    const staging = mkdtempSync(join(tmpdir(), 'siku-download-'));
    const dest = mkdtempSync(join(tmpdir(), 'siku-content-'));
    try {
      const tarPath = join(staging, 'content.tar.gz');
      writeFileSync(tarPath, tarball);
      await extract({ file: tarPath, cwd: dest, strip: 1 });
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
    return dest;
  }
}

/** 读取临时目录下某个文件内容（诊断/校验用）。 */
export function readContentFile(contentRoot: string, relativePath: string): string {
  return readFileSync(join(contentRoot, relativePath), 'utf8');
}
