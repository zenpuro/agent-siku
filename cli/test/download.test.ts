import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { create } from 'tar';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DownloadDeps, downloadContent } from '../src/download.ts';

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
  it('downloads, extracts and strips the GitHub top-level dir', async () => {
    const fetchCalls: string[] = [];
    const deps: DownloadDeps = {
      fetchImpl: async (url) => {
        fetchCalls.push(String(url));
        return new Response(tarball, { status: 200 });
      },
    };
    const dest = await downloadContent({ repo: 'zenpuro/agent-siku', ref: 'main' }, deps);
    try {
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0]).toContain('refs/heads/main');
      expect(existsSync(join(dest, 'skills', 'engineering', 'init', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(dest, 'agents-md', 'git-workflow.md'))).toBe(true);
      expect(existsSync(join(dest, TOP_DIR))).toBe(false);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it('falls back from branches to tags on 404', async () => {
    const urls: string[] = [];
    const deps: DownloadDeps = {
      fetchImpl: async (url) => {
        urls.push(String(url));
        if (!String(url).includes('refs/tags')) return new Response(null, { status: 404 });
        return new Response(tarball, { status: 200 });
      },
    };
    const dest = await downloadContent({ repo: 'zenpuro/agent-siku', ref: 'v1.0.0' }, deps);
    rmSync(dest, { recursive: true, force: true });
    expect(urls.some((u) => u.includes('refs/tags/v1.0.0'))).toBe(true);
  });

  it('throws a helpful error when ref exists nowhere', async () => {
    const deps: DownloadDeps = {
      fetchImpl: async () => new Response(null, { status: 404 }),
    };
    await expect(
      downloadContent({ repo: 'zenpuro/agent-siku', ref: 'nope' }, deps),
    ).rejects.toThrow('分支与标签均不存在');
  });

  it('fails fast on non-404 HTTP errors without tag fallback', async () => {
    let calls = 0;
    const deps: DownloadDeps = {
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 500 });
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

async function makeTarball(dir: string, topDir: string): Promise<Buffer> {
  const file = join(dir, 'bundle.tar.gz');
  await create({ gzip: true, file, cwd: dir, portable: true }, [topDir]);
  return readFileSync(file);
}

function mkdir2(p: string): void {
  mkdirSync(p, { recursive: true });
}
