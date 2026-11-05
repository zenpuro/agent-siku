/** 当前支持的 agent。扩展新 agent 时在此联合类型与 agents.ts 注册表中各加一项。 */
export type AgentId = 'claude-code' | 'pi' | 'zcode';

export interface AgentConfig {
  id: AgentId;
  displayName: string;
  /**
   * 是否需要派生 .claude/* 专属产物（skills / rules / CLAUDE.md）。
   * pi 与 zcode 通过 .agents/skills 覆盖，此处为 false。
   */
  generateClaudeArtifacts: boolean;
}

/** 一个可安装的技能：skills/ 下任何直接包含 SKILL.md 的目录。 */
export interface SkillInfo {
  /** 相对 skills/ 的显示路径，如 engineering/mattcopock/ask-matt。 */
  id: string;
  /** SKILL.md 所在目录名，即安装到目标后的目录名，如 ask-matt。 */
  dirName: string;
  /** 内容包内该技能目录的路径。 */
  srcDir: string;
  /** SKILL.md frontmatter 的 description（交互列表不展示，保留供后续用）。 */
  description?: string;
}

/** 一个可注入的 agents-md 片段：agents-md/ 下任意深度的 .md 文件。 */
export interface AgentsMdFileInfo {
  /** 相对 agents-md/ 的显示路径，如 workflows/git-workflow.md。 */
  id: string;
  /** 内容包内该文件的路径。 */
  srcFile: string;
}

/** 一个可安装的规则文件：rules/<分类>/<文件>.md。 */
export interface RuleInfo {
  /** 相对 rules/ 的路径，如 common/coding-style.md。 */
  id: string;
  /** 分类目录名，安装时保留为子目录。 */
  category: string;
  /** 内容包内该文件的路径。 */
  srcFile: string;
}

/** 从内容源扫描出的可安装清单。 */
export interface ContentManifest {
  rootDir: string;
  skills: SkillInfo[];
  rules: RuleInfo[];
  /** agents-md/ 下全部 .md 文件（含子目录，已按相对路径排序）。 */
  agentsMdFiles: AgentsMdFileInfo[];
}

/** 用户在交互流中做出的选择（agents-md 选择独立于计划，见 cli.ts）。 */
export interface InstallSelection {
  skills: SkillInfo[];
  rules: RuleInfo[];
}

export interface SkillTarget {
  skill: SkillInfo;
  toDir: string;
}

export interface RuleTarget {
  rule: RuleInfo;
  toFile: string;
}

export interface InstallPlan {
  skillTargets: SkillTarget[];
  ruleTargets: RuleTarget[];
  /** 计划阶段发现的问题（如技能目录名冲突），由上层打印。 */
  warnings: string[];
}

export type InstallScope = 'project' | 'user';

/** 一次安装的完整输入。 */
export interface InstallOptions {
  scope: InstallScope;
  /** 安装根目录：project = cwd，user = 用户主目录。 */
  rootDir: string;
  agents: AgentId[];
  selection: InstallSelection;
}

export interface LockSource {
  /** 内容仓库 git URL；--source 本地安装时为 "(local) <目录名>" 标记。 */
  url: string;
  ref: string;
  /** clone 得到的 commit SHA（本地源无此字段）。 */
  sha?: string;
}

export interface LockFile {
  version: 1;
  installedAt: string;
  source: LockSource;
  /** 技能目录名 → 内容聚合 sha256。 */
  skills: Record<string, string>;
  /** 相对路径 → 内容聚合 sha256。 */
  rules: Record<string, string>;
  /** 本轮注入的 agents-md 片段 id（相对 agents-md/ 的路径）；空数组 = 未注入。 */
  agentsMd: string[];
}
