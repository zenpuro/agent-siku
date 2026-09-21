# Spec: siku

## Objective

`siku` 是一个 TypeScript + Node.js CLI（npm 包），把集中维护的 agent 内容（skills、rules、agents-md）从 GitHub 仓库安装到任意项目或用户环境。

- **用户**：使用 AI 编码 agent（claude code / pi / zcode）的开发者。
- **核心价值**：CLI 与内容分离——CLI 独立发布、极少更新；内容更新 = 内容仓库 git push，零发布。
- **成功的样子**：`npx siku install` 完成交互式安装后，目标环境出现正确的目录结构与 AGENTS.md；内容仓库推送后再次运行 `siku install` 即可获取新内容。

### 明确的非目标（v1）

- 不做 `update` / `remove` 子命令（lock 文件为它们铺路，但命令本身不实现）。
- 不支持 codex / grok / qoder / trae 等其他 agent（注册表结构预留）。
- 不同步 agents、commands、hooks 等其他内容类型（架构预留，v1 只做 skills / rules / agents-md）。

## Tech Stack

| 项 | 选择 |
|---|---|
| 语言/运行时 | TypeScript（ESM），Node >= 20 |
| 交互 | `@clack/prompts` |
| 解压 | `tar` |
| 输出着色 | `picocolors` |
| 构建 | `tsdown`（单文件 bundle 到 `cli/dist/`，含 shebang） |
| 测试 | `vitest` |
| Lint/格式化 | `biome` |
| 开发运行 | `tsx` |
| 包管理 | npm（不用 workspaces） |

运行时依赖仅：`@clack/prompts`、`tar`、`picocolors`。

## Commands

```bash
cd cli
npm install              # 安装依赖
npm run dev              # tsx src/cli.ts（本地调试，配 --source ../ 直读本地内容）
npm run build            # tsdown 构建 → cli/dist/cli.mjs
npm test                 # vitest run
npm run lint             # biome check
npm run format           # biome format --write
npm run typecheck        # tsc --noEmit
npm publish              # 在 cli/ 目录内发布，包内仅 dist（files: ["dist"]）
```

CLI 用法：

```
siku install             # 交互式安装（内容安装的唯一入口）
siku install --project   # 跳过第一步，锁定项目安装（cwd）
siku install --user      # 跳过第一步，锁定用户安装（~）
siku install --ref <ref>         # 内容 ref，默认 main
siku install --repo <owner/repo> # 内容仓库，覆盖默认值
siku install --source <dir>      # 直读本地内容目录（开发用，离线，跳过下载）
siku / siku --help               # 打印用法，提示 siku install
siku --version
```

子命令形态为后续 `siku update` / `siku remove` 预留。

## 内容源

- 默认仓库：`SIKU_REPO` 环境变量 > `--repo` flag > 内置默认值 `zenpuro/agent-siku`（`src/constants.ts`）。
- 下载：`https://codeload.github.com/{repo}/tar.gz/refs/heads/{ref}`（公共仓库，无认证），解压到临时目录。
- 内容目录约定（位于仓库根）：`skills/`、`rules/`、`agents-md/`。
- **skills 发现**：`skills/` 下任何直接包含 `SKILL.md` 的目录视为一个技能（任意深度）；技能显示名 = 相对 `skills/` 的路径（如 `engineering/mattcopock/ask-matt`）；安装时目录名取 `SKILL.md` 所在目录名，同名冲突则跳过并警告。
- **rules 发现**：`rules/<分类>/<文件>.md，两级结构。
- **agents-md 内容**：`agents-md/` 下全部 `.md` 文件按文件名排序拼接（`\n\n` 分隔）。

## 交互流程

1. **安装范围**：Project（cwd）/ User（`~`）。已被 `--project`/`--user` 跳过。
2. **选择 agent**（多选）：`Claude Code` / `Pi` / `ZCode`。预选本机已检测到的（`~/.claude`、`~/.pi/agent`、`~/.zcode` 存在）。
3. **选择 skills**（多选，可搜索）：
   - 选项按分类分组：每个分类一条「目录全选」项（`dir:<category>`），其后缩进列出各技能（`skill:<相对路径>`）。可混合选择。
   - 目标：**始终**写 `<root>/.agents/skills/`；若选了 claude-code，**同时复制**一份到 `<root>/.claude/skills/`。pi / zcode 无额外处理。
4. **选择 rules**（多选，同上交互）：
   - 仅当选了 claude-code 时生效 → `<root>/.claude/rules/`（保留分类子目录结构）；否则跳过此步并提示。
5. **是否注入 agents-md**（是/否）：
   - 项目安装：`<project>/AGENTS.md`。已存在 → 询问：覆盖 / 追加标记区块 / 跳过。
   - 用户安装：始终生成 `~/.agents/AGENTS.md`；选了 claude-code → 同时生成 `~/.claude/CLAUDE.md`。存在时同样询问。
   - 标记区块格式：`<!-- siku:start -->` … `<!-- siku:end -->`。
6. **执行安装**，打印安装摘要（写了哪些路径、共多少文件）。

## 安装目标总表

| 内容 | 项目安装（root = cwd） | 用户安装（root = ~） |
|---|---|---|
| skills | `<root>/.agents/skills/**` 始终；claude-code → `<root>/.claude/skills/**` | 同左 |
| rules | claude-code → `<root>/.claude/rules/**`；否则不装 | 同左 |
| agents-md | claude-code 无关；`<project>/AGENTS.md` | `<root>/.agents/AGENTS.md` 始终；claude-code → `<root>/.claude/CLAUDE.md` |

复制语义：逐文件复制（目标已存在且属于本次安装清单则覆盖）；**不删除**目标目录中既有但不在本次清单内的文件。

## Lock 文件

写入 `<root>/siku-lock.json`（项目安装写项目根，用户安装写 `~`）：

```json
{
  "version": 1,
  "installedAt": "2026-01-01T00:00:00.000Z",
  "source": { "repo": "owner/repo", "ref": "main", "resolvedRef": "main" },
  "skills": { "init": "<sha256>", "ask-matt": "<sha256>" },
  "rules": { "common/coding-style.md": "<sha256>" },
  "agentsMd": true
}
```

v1 只写不读（为 update/remove 铺路）。hash = 各安装单元内文件的聚合 sha256。

## Agent 注册表（扩展点）

```ts
type AgentId = "claude-code" | "pi" | "zcode";
interface AgentConfig {
  id: AgentId;
  displayName: string;
  detectInstalled(): boolean;   // 预选用，不阻断选择
  generateClaudeArtifacts: boolean; // 仅 claude-code 为 true
}
```

新增 agent = 加一条配置 +（如需要）在 installer 中挂一个目标映射，不改主流程。

## Project Structure

```
cli/
├── SPEC.md               ← 本文档
├── package.json          ← name: "siku", bin: { siku: "./dist/cli.mjs" }, files: ["dist"]
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
├── src/
│   ├── cli.ts            ← 入口：解析 args、编排流程、错误处理与退出码
│   ├── constants.ts      ← 默认 repo、ref、路径常量
│   ├── types.ts          ← AgentId / InstallOptions / Selection / LockFile 等
│   ├── agents.ts         ← agent 注册表 + 安装检测
│   ├── content.ts        ← 下载/解压 或 本地 source；发现 skills/rules/agents-md
│   ├── prompts.ts        ← 全部 @clack/prompts 交互（薄层，不含业务逻辑）
│   ├── installer.ts      ← 复制引擎：selection → 目标路径
│   ├── agents-md.ts      ← AGENTS.md / CLAUDE.md 生成、标记区块合并
│   └── lock.ts           ← siku-lock.json 构建与写入
└── test/
    ├── agents.test.ts
    ├── content.test.ts   ← 网络调用注入 mock；发现逻辑用 fixture 目录
    ├── installer.test.ts
    ├── agents-md.test.ts
    └── lock.test.ts
```

## Code Style

```ts
// ESM 命名导出；库函数纯、同步签名优先，副作用集中在上层
export function planSkillTargets(sel: SkillSelection, root: string, agents: AgentId[]): Target[] {
  const universal = join(root, ".agents", "skills");
  const targets = sel.skills.map((s) => ({ from: s.srcDir, to: join(universal, s.dirName) }));
  if (agents.includes("claude-code")) {
    const claudeDir = join(root, ".claude", "skills");
    targets.push(...sel.skills.map((s) => ({ from: s.srcDir, to: join(claudeDir, s.dirName) })));
  }
  return targets;
}
```

- 模块职责单一，`prompts.ts` 不含 fs 逻辑，`installer.ts` 不含交互。
- 路径一律 `node:path`（`join`/`resolve`），fs 用 `node:fs/promises`。
- 错误处理：入口统一 try/catch → 红字输出 → `process.exitCode = 1`；库函数 throw 带上下文的 `Error`。
- 提交信息遵循仓库根 AGENTS.md（`<type>: <description>`，不加 co-author）。

## Testing Strategy

- 框架 vitest，测试放 `cli/test/`，与源码同构命名。
- fs 相关（installer / agents-md / lock）：真实临时目录（`fs.mkdtemp`），断言产物路径与内容，测后清理。
- content 发现逻辑：`test/fixtures/content/` 模拟仓库结构；下载逻辑注入 fetch/extract 依赖后 mock。
- prompts 层不写自动化测试，靠 `npm run dev` 手动验证 + installer 单测覆盖业务逻辑。
- 覆盖率：不设硬门槛，但 installer / agents-md / lock / content 四模块的核心分支必须有测试。

## Boundaries

- **Always**：提交前 `npm test` + `npm run lint` + `npm run typecheck` 全绿；新目标路径先改本 spec 再改代码；对内容仓库只读（CLI 代码永不修改 `skills/` `rules/` `agents-md/`）。
- **Ask first**：新增运行时依赖；修改安装目标路径或 lock schema；改变已存在文件的处理语义（覆盖/追加/跳过）。
- **Never**：删除目标目录中非本次安装清单内的文件；把内容目录打进 npm 包（`npm pack --dry-run` 必须只见 dist）；静默吞错。

## Success Criteria

1. 在空目录执行 `siku install --project --source <本仓库>`：交互完成后产生 `.agents/skills/<选中技能>/...`；选 claude-code 时同时有 `.claude/skills/`；选 rules 且选 claude-code 时有 `.claude/rules/<分类>/<文件>.md`；agents-md 注入行为符合第 5 步定义；生成 `siku-lock.json`。
2. 用户安装（`siku install --user`）在 `~` 下产生对应结构（测试中用临时 HOME 模拟）。
3. AGENTS.md 已存在时三种选项（覆盖/追加/跳过）行为正确，追加产生成对标记区块。
4. `--source` 模式完全离线可用。
5. `npm pack --dry-run` 输出仅含 `dist/` 与 package.json 等元文件，不含任何内容目录。
6. `npm test`、`npm run lint`、`npm run typecheck`、`npm run build` 全部通过。

## Open Questions

（无）
