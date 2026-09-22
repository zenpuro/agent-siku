import type { ExecFileException } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { type CloneDeps, cloneContent, type ExecFileLike, parseRepoUrl } from '../src/download.ts';

interface RecordedCall {
  file: string;
  args: readonly string[];
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number };
}

/** 记录 git 调用并按脚本应答的 execFile 替身。 */
function fakeGit(
  respond: (args: readonly string[]) => {
    stdout?: string;
    stderr?: string;
    error?: ExecFileException;
  },
): { calls: RecordedCall[]; impl: ExecFileLike } {
  const calls: RecordedCall[] = [];
  const impl: ExecFileLike = (file, args, options, callback) => {
    calls.push({ file, args, options });
    const out = respond(args);
    callback(out.error ?? null, out.stdout ?? '', out.stderr ?? '');
  };
  return { calls, impl };
}

/** 构造带 cmd/code 的 ExecFileException（类型要求 cmd 必填）。 */
function gitError(stderr: string, extra: Partial<ExecFileException> = {}): ExecFileException {
  const error = new Error(`git exited badly: ${stderr}`) as ExecFileException;
  error.cmd = 'git';
  error.code = 128;
  Object.assign(error, extra);
  return error;
}

/** 返回一个总是以给定 stderr/错误属性失败的 git 替身。 */
function failingGit(
  stderr: string,
  extra: Partial<ExecFileException> = {},
): { calls: RecordedCall[]; impl: ExecFileLike } {
  return fakeGit(() => ({ stderr, error: gitError(stderr, extra) }));
}

const leftovers: string[] = [];
function track(dir: string): string {
  leftovers.push(dir);
  return dir;
}

afterEach(() => {
  while (leftovers.length > 0) {
    rmSync(leftovers.pop() as string, { recursive: true, force: true });
  }
});

describe('cloneContent', () => {
  const depsOf = (impl: ExecFileLike): CloneDeps => ({ execFileImpl: impl });

  it('shallow-clones the ref into a temp dir and returns the worktree plus resolved sha', async () => {
    const git = fakeGit((args) => (args[0] === 'rev-parse' ? { stdout: 'abc1234def5678\n' } : {}));
    const { dir, sha } = await cloneContent(
      { url: 'https://github.com/owner/repo', ref: 'main' },
      depsOf(git.impl),
    );
    track(dir);

    expect(sha).toBe('abc1234def5678');
    expect(git.calls).toHaveLength(2);

    const clone = git.calls[0] as RecordedCall;
    expect(clone.file).toBe('git');
    expect(clone.args).toEqual([
      'clone',
      '--depth',
      '1',
      '--single-branch',
      '--branch',
      'main',
      'https://github.com/owner/repo',
      clone.args.at(-1) as string,
    ]);
    // 非交互安全：禁止 git 挂起等待终端输入凭据
    expect(clone.options.env?.GIT_TERMINAL_PROMPT).toBe('0');
    expect(clone.options.timeout).toBeGreaterThan(0);
    expect(dir).toBe(clone.args.at(-1));
    expect(existsSync(dir)).toBe(true);

    const revParse = git.calls[1] as RecordedCall;
    expect(revParse.args).toEqual(['rev-parse', 'HEAD']);
    expect(revParse.options.cwd).toBe(dir);
  });

  it('embeds a token as basic-auth userinfo on https urls only', async () => {
    const https = fakeGit(() => ({}));
    const r1 = await cloneContent(
      { url: 'https://github.com/owner/repo', ref: 'main', token: 'gh_secret' },
      depsOf(https.impl),
    );
    track(r1.dir);
    expect(https.calls[0]?.args.at(-2)).toBe(
      'https://x-access-token:gh_secret@github.com/owner/repo',
    );

    const ssh = fakeGit(() => ({}));
    const r2 = await cloneContent(
      { url: 'git@github.com:owner/repo', ref: 'main', token: 'gh_secret' },
      depsOf(ssh.impl),
    );
    track(r2.dir);
    expect(ssh.calls[0]?.args.at(-2)).toBe('git@github.com:owner/repo');
  });

  it('rejects unsafe urls and refs before invoking git', async () => {
    const git = fakeGit(() => ({}));
    const deps = depsOf(git.impl);
    await expect(cloneContent({ url: '-evil-flag', ref: 'main' }, deps)).rejects.toThrow(
      'Invalid repo',
    );
    await expect(cloneContent({ url: 'has space', ref: 'main' }, deps)).rejects.toThrow();
    await expect(
      cloneContent({ url: 'https://github.com/o/r', ref: '-evil' }, deps),
    ).rejects.toThrow('Invalid ref');
    await expect(
      cloneContent({ url: 'https://github.com/o/r', ref: 'a b' }, deps),
    ).rejects.toThrow();
    await expect(
      cloneContent({ url: 'https://github.com/o/r', ref: '..' }, deps),
    ).rejects.toThrow();
    await expect(
      cloneContent({ url: 'https://github.com/o/r', ref: '/abs' }, deps),
    ).rejects.toThrow();
    expect(git.calls).toHaveLength(0);
  });

  it('reports a friendly error when git is not installed and cleans up the temp dir', async () => {
    const git = failingGit('', { code: 'ENOENT' });
    await expect(
      cloneContent({ url: 'https://github.com/owner/repo', ref: 'main' }, depsOf(git.impl)),
    ).rejects.toThrow(/git not found in PATH/);
    const dest = git.calls[0]?.args.at(-1) as string;
    expect(existsSync(dest)).toBe(false);
  });

  it('maps auth failures to a setup hint', async () => {
    const git = failingGit("fatal: Authentication failed for 'https://github.com/owner/repo/'");
    await expect(
      cloneContent({ url: 'https://github.com/owner/repo', ref: 'main' }, depsOf(git.impl)),
    ).rejects.toThrow(/gh auth login|SSH key/);
  });

  it('maps a missing ref to a branch/tag-only hint', async () => {
    const git = failingGit('fatal: Remote branch deadbeef not found in upstream origin');
    await expect(
      cloneContent({ url: 'https://github.com/owner/repo', ref: 'deadbeef' }, depsOf(git.impl)),
    ).rejects.toThrow(/branches and tags only/);
  });

  it('maps a killed clone to a timeout message', async () => {
    const git = failingGit('', { killed: true, signal: 'SIGTERM' });
    await expect(
      cloneContent({ url: 'https://github.com/owner/repo', ref: 'main' }, depsOf(git.impl)),
    ).rejects.toThrow(/timed out/);
  });

  it('never leaks the token through error messages', async () => {
    const git = failingGit('fatal: unable to access https://x-access-token:gh_secret@github.com/');
    const err: Error = await cloneContent(
      { url: 'https://github.com/owner/repo', ref: 'main', token: 'gh_secret' },
      depsOf(git.impl),
    ).then(
      () => {
        throw new Error('expected cloneContent to reject');
      },
      (e: Error) => e,
    );
    expect(err.message).toContain('***');
    expect(err.message).not.toContain('gh_secret');
  });
});

describe('parseRepoUrl', () => {
  it('expands bare owner/repo to github.com https', () => {
    expect(parseRepoUrl('owner/repo')).toBe('https://github.com/owner/repo');
    expect(parseRepoUrl('owner/repo.git')).toBe('https://github.com/owner/repo');
    expect(parseRepoUrl('  owner/repo  ')).toBe('https://github.com/owner/repo');
  });

  it('passes through https/ssh git urls normalized', () => {
    expect(parseRepoUrl('https://github.com/owner/repo')).toBe('https://github.com/owner/repo');
    expect(parseRepoUrl('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
    expect(parseRepoUrl('https://github.com/owner/repo/')).toBe('https://github.com/owner/repo');
    expect(parseRepoUrl('http://git.example.com/team/repo.GIT')).toBe(
      'http://git.example.com/team/repo',
    );
    expect(parseRepoUrl('git@github.com:owner/repo.git')).toBe('git@github.com:owner/repo');
    expect(parseRepoUrl('ssh://git@gitlab.com/group/repo')).toBe('ssh://git@gitlab.com/group/repo');
    expect(parseRepoUrl('https://gitlab.com/group/sub/repo')).toBe(
      'https://gitlab.com/group/sub/repo',
    );
    // 子路径原样透传：裁剪需要 host 知识，交给 git 报错
    expect(parseRepoUrl('https://github.com/owner/repo/tree/main')).toBe(
      'https://github.com/owner/repo/tree/main',
    );
  });

  it('rejects malformed links', () => {
    expect(() => parseRepoUrl('')).toThrow('Invalid repo link');
    expect(() => parseRepoUrl('just-a-name')).toThrow('Invalid repo link');
    expect(() => parseRepoUrl('../etc/passwd')).toThrow('Invalid repo link');
    expect(() => parseRepoUrl('a/../b')).toThrow('Invalid repo link');
    expect(() => parseRepoUrl('-flag/evil')).toThrow('Invalid repo link');
    expect(() => parseRepoUrl('file:///etc/passwd')).toThrow('Invalid repo link');
  });
});
