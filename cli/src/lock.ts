import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LOCK_FILE_NAME } from './constants.ts';
import type { InstallPlan, LockFile, LockSource } from './types.ts';
/** 目录内容聚合 sha256：按相对路径排序后逐文件喂入「路径\\0内容\\0」。 */
export function hashDir(dir: string): string {
  const hash = createHash('sha256');
  for (const rel of listFiles(dir).sort()) {
    hash.update(rel);
    hash.update('\\0');
    hash.update(readFileSync(join(dir, rel)));
    hash.update('\\0');
  }
  return hash.digest('hex');
}

export function hashFile(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (cur: string): void => {
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const full = join(cur, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(relative(dir, full).replaceAll('\\', '/'));
    }
  };
  walk(dir);
  return out;
}

/**
 * 由安装计划构建 lock 对象。
 * 技能去重（同一技能可能在 .agents 与 .claude 各一份，内容相同，只记一条）。
 */
export function buildLockFile(source: LockSource, plan: InstallPlan, agentsMd: boolean): LockFile {
  const skills: Record<string, string> = {};
  for (const { skill } of plan.skillTargets) {
    if (skills[skill.dirName] === undefined) {
      skills[skill.dirName] = hashDir(skill.srcDir);
    }
  }
  const rules: Record<string, string> = {};
  for (const { rule } of plan.ruleTargets) {
    rules[rule.id] = hashFile(rule.srcFile);
  }
  return {
    version: 1,
    installedAt: new Date().toISOString(),
    source,
    skills,
    rules,
    agentsMd,
  };
}

/** 写入 <rootDir>/siku-lock.json。 */
export function writeLockFile(rootDir: string, lock: LockFile): string {
  const file = join(rootDir, LOCK_FILE_NAME);
  writeFileSync(file, `${JSON.stringify(lock, null, 2)}\n`);
  return file;
}
