import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract as tarExtract } from 'tar';

const REPO_SLUG = /^[^\s/]+\/[^\s/]+$/;

/** tar 解压所需的最小选项集（结构化类型，避免耦合 tar 的类型导出）。 */
interface ExtractCall {
  file: string;
  cwd: string;
  strip?: number;
}

export interface RemoteContentOptions {
  /** GitHub 仓库，owner/repo 形式。 */
  repo: string;
  /** 分支或标签，默认 main。 */
  ref: string;
}

export interface DownloadDeps {
  fetchImpl?: typeof fetch;
  extract?: (options: ExtractCall) => Promise<void>;
}

/**
 * 从 GitHub 拉取内容仓库 tarball 并解压到临时目录。
 * 依次尝试分支（refs/heads）与标签（refs/tags）；tar 包默认行为已拒绝
 * 绝对路径与越出解压目录的条目，叠加 strip:1 剥离 GitHub 的顶层目录。
 * 返回解压后的内容根目录，调用方负责用后清理。
 */
export async function downloadContent(
  options: RemoteContentOptions,
  deps: DownloadDeps = {},
): Promise<string> {
  const { repo, ref } = options;
  if (!REPO_SLUG.test(repo)) {
    throw new Error(`无效的仓库标识: ${repo}（应为 owner/repo）`);
  }
  if (repo.includes('..') || ref.includes('..') || ref.startsWith('/')) {
    throw new Error('repo/ref 含有非法字符');
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const extract = deps.extract ?? ((o: ExtractCall) => tarExtract(o));

  const urls = [
    `https://codeload.github.com/${repo}/tar.gz/refs/heads/${ref}`,
    `https://codeload.github.com/${repo}/tar.gz/refs/tags/${ref}`,
  ];

  for (const url of urls) {
    const res = await fetchImpl(url, { redirect: 'follow' });
    if (res.status === 404) continue;
    if (!res.ok) {
      throw new Error(`下载失败（HTTP ${res.status}）: ${url}`);
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
  throw new Error(`未找到内容源 ${repo}@${ref}（分支与标签均不存在）`);
}

/** 读取临时目录下某个文件内容（诊断/校验用）。 */
export function readContentFile(contentRoot: string, relativePath: string): string {
  return readFileSync(join(contentRoot, relativePath), 'utf8');
}
