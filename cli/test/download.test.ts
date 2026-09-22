import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { create } from 'tar';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DownloadDeps, downloadContent, parseRepoInput } from '../src/download.ts';

const TOP_DIR = 'zenpuro-agent-siku-main';

let fixtureDir: string;
let tarball: Buffer;

beforeAll(async () => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'siku-download-fixture-'));
  const repoRoot = join(fixtureDir, TOP_DIR);
  const skills = join(repoRoot, 'skills/engineering/init');
  mkdir2(skills);
  writeFileSync(join(skills, 'SKILL.md'), '---\nname: init\n---\n');
  mkdir2(join(repoRoot, 'agents-md'));
  writeFileSync(join(repoRoot, 'agents-md/git-workflow.md'), '## Git');
  tarball = await makeTarball(fixtureDir, TOP_DIR);
});

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('downloadContent', () => {
  it('downloads via the GitHub API tarball endpoint and strips the top-level dir', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const deps: DownloadDeps = {
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(tarball, { status: 200 });
      },
    };
    const dest = await downloadContent({ repo: 'zenpuro/agent-siku', ref: 'main' }, deps);
    try {
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('https://api.github.com/repos/zenpuro/agent-siku/tarball/main');
      expect(existsSync(join(dest, 'skills', 'engineering', 'init', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(dest, 'agents-md', 'git-workflow.md'))).toBe(true);
      expect(existsSync(join(dest, TOP_DIR))).toBe(false);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it('sends the token as a Bearer auth header when provided', async () => {
    let headers: Record<string, string> = {};
    const deps: DownloadDeps = {
      fetchImpl: async (_url, init) => {
        headers = init?.headers as Record<string, string>;
        return new Response(tarball, { status: 200 });
      },
    };
    const dest = await downloadContent(
      { repo: 'zenpuro/agent-siku', ref: 'main', token: 'gh_secret' },
      deps,
    );
    rmSync(dest, { recursive: true, force: true });
    expect(headers.Authorization).toBe('Bearer gh_secret');
    expect(headers['User-Agent']).toBeTruthy();
  });

  it('prompts for a token on 404 and retries with it (private repo)', async () => {
    const seen: (string | undefined)[] = [];
    const deps: DownloadDeps = {
      fetchImpl: async (_url, init) => {
        const h = init?.headers as Record<string, string>;
        seen.push(h.Authorization);
        return seen.length === 1
          ? new Response(null, { status: 404 })
          : new Response(tarball, { status: 200 });
      },
      promptToken: async () => 'gh_prompted',
    };
    const dest = await downloadContent({ repo: 'zenpuro/agent-siku', ref: 'main' }, deps);
    rmSync(dest, { recursive: true, force: true });
    expect(seen).toEqual([undefined, 'Bearer gh_prompted']);
  });

  it('aborts with not-found when no token is given and prompting is declined', async () => {
    let calls = 0;
    const deps: DownloadDeps = {
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 404 });
      },
      promptToken: async () => undefined,
    };
    await expect(
      downloadContent({ repo: 'zenpuro/agent-siku', ref: 'nope' }, deps),
    ).rejects.toThrow('not found');
    expect(calls).toBe(1);
  });

  it('reports not-found when a provided token still gets 404', async () => {
    let calls = 0;
    const deps: DownloadDeps = {
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 404 });
      },
      promptToken: async () => {
        throw new Error('promptToken must not run when a token was already provided');
      },
    };
    await expect(
      downloadContent({ repo: 'zenpuro/agent-siku', ref: 'nope', token: 'stale' }, deps),
    ).rejects.toThrow('token cannot access');
    expect(calls).toBe(1);
  });

  it('fails fast on non-404 HTTP errors without prompting', async () => {
    let calls = 0;
    const deps: DownloadDeps = {
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 500 });
      },
      promptToken: async () => {
        throw new Error('promptToken must not run for non-404 errors');
      },
    };
    await expect(
      downloadContent({ repo: 'zenpuro/agent-siku', ref: 'main' }, deps),
    ).rejects.toThrow('HTTP 500');
    expect(calls).toBe(1);
  });

  it('rejects malformed repo slugs before any network call', async () => {
    let calls = 0;
    const deps: DownloadDeps = {
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 200 });
      },
    };
    await expect(downloadContent({ repo: 'just-a-name', ref: 'main' }, deps)).rejects.toThrow(
      'owner/repo',
    );
    await expect(downloadContent({ repo: '../etc', ref: 'main' }, deps)).rejects.toThrow();
    await expect(downloadContent({ repo: 'a/b', ref: '..' }, deps)).rejects.toThrow();
    expect(calls).toBe(0);
  });
});

describe('parseRepoInput', () => {
  it('accepts owner/repo as-is', () => {
    expect(parseRepoInput('owner/repo')).toBe('owner/repo');
  });

  it('normalizes github.com URLs and SSH forms to a slug', () => {
    expect(parseRepoInput('https://github.com/owner/repo')).toBe('owner/repo');
    expect(parseRepoInput('https://github.com/owner/repo.git')).toBe('owner/repo');
    expect(parseRepoInput('https://github.com/owner/repo/')).toBe('owner/repo');
    expect(parseRepoInput('http://www.github.com/owner/repo.GIT')).toBe('owner/repo');
    expect(parseRepoInput('git@github.com:owner/repo.git')).toBe('owner/repo');
  });

  it('rejects non-GitHub hosts and malformed links', () => {
    expect(() => parseRepoInput('https://gitlab.com/owner/repo')).toThrow('Invalid repo link');
    expect(() => parseRepoInput('https://github.com/owner/repo/tree/main')).toThrow(
      'Invalid repo link',
    );
    expect(() => parseRepoInput('just-a-name')).toThrow('Invalid repo link');
    expect(() => parseRepoInput('')).toThrow('Invalid repo link');
  });
});

async function makeTarball(dir: string, topDir: string): Promise<Buffer> {
  const file = join(dir, 'bundle.tar.gz');
  await create({ gzip: true, file, cwd: dir, portable: true }, [topDir]);
  return readFileSync(file);
}

function mkdir2(p: string): void {
  mkdirSync(p, { recursive: true });
}
