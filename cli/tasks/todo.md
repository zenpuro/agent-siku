# Todo: siku CLI

> 计划详见 `plan.md`；规格详见 `../SPEC.md`。

## Phase 1: Foundation

- [x] Task 1: 脚手架
  - Acceptance: `npm run build` 产出 `dist/cli.mjs`；`node dist/cli.mjs --help` 打印 `siku install` 用法；`--version` 打印版本；typecheck/lint/test 全绿
  - Verify: `npm run build && npm run typecheck && npm run lint && npm test`
  - Files: `package.json` `tsconfig.json` `tsdown.config.ts` `vitest.config.ts` `biome.json` `src/cli.ts` `src/constants.ts` `src/types.ts` `.gitignore`（根）
  - Notes:
    - 本机沙箱中 bash→native 进程传递 PATH 会在 ~100 字符处截断，导致 npm 脚本找不到 node。临时绕过：所有 npm 命令前加 `export PATH="/d/software/Node:$PATH"`。用户本机终端不受影响。
    - `@biomejs/cli-win32-x64` 因网络抖动缺失时，用 `--registry=https://registry.npmmirror.com` 补装。

## Phase 2: Core Domain

- [ ] Task 2: agent 注册表
  - Acceptance: 三个 agent 配置齐全；`detectInstalled` 按 `~/.claude`、`~/.pi/agent`、`~/.zcode` 判定（注入 home 便于测试）
  - Verify: `npx vitest run test/agents.test.ts`
  - Files: `src/agents.ts` `test/agents.test.ts`
  - Depends: Task 1

- [ ] Task 3: 内容发现（本地扫描）
  - Acceptance: 从内容根目录扫出 skills（含 SKILL.md 的目录，任意深度，相对路径命名）、rules（两级）、agents-md 文件列表；空目录/缺失目录不报错
  - Verify: `npx vitest run test/content.test.ts`（fixtures 模拟真实仓库结构）
  - Files: `src/content.ts` `test/content.test.ts` `test/fixtures/content/**`
  - Depends: Task 1

- [ ] Task 4: 内容下载（远端）
  - Acceptance: fetchTarball 拉取 codeload tarball 并解压剥离顶层目录；注入 fetch 依赖可 mock；非法 entry（绝对路径 / `..`）被拒绝；`--source` 时完全跳过
  - Verify: `npx vitest run test/content.test.ts`
  - Files: `src/content.ts` `test/content.test.ts`
  - Depends: Task 3

- [ ] Task 5: 安装引擎
  - Acceptance: 按 selection 生成目标清单（.agents/skills 恒有；claude-code 派生 .claude/skills；rules 仅 claude-code 且保留分类子目录）；逐文件复制；只覆盖清单内文件、不删除其他文件；同名技能跳过并警告
  - Verify: `npx vitest run test/installer.test.ts`（临时目录断言）
  - Files: `src/installer.ts` `test/installer.test.ts`
  - Depends: Task 2, 3

- [ ] Task 6: AGENTS.md
  - Acceptance: 不存在→生成；存在→覆盖 / 追加标记区块（幂等，重复安装不重复追加）/ 跳过；用户安装目标为 ~/.agents/AGENTS.md 与 ~/.claude/CLAUDE.md
  - Verify: `npx vitest run test/agents-md.test.ts`
  - Files: `src/agents-md.ts` `test/agents-md.test.ts`
  - Depends: Task 3

- [ ] Task 7: lock 文件
  - Acceptance: 按安装结果构建 lock 对象（repo/ref/单元 hash），写入 `<root>/siku-lock.json`
  - Verify: `npx vitest run test/lock.test.ts`
  - Files: `src/lock.ts` `test/lock.test.ts`
  - Depends: Task 5

### Checkpoint: Core Domain
- [ ] `npm test` 全绿；lint/typecheck 通过

## Phase 3: Interactive + Wiring

- [ ] Task 8: 交互层
  - Acceptance: scope（可被 flag 跳过）→ agents 多选（已安装预选）→ skills 可搜索多选（分类全选项 + 个体项）→ rules（无 claude-code 时提示跳过）→ agents-md 是/否与冲突三选
  - Verify: `npm run dev -- install --source ../` 手动走查
  - Files: `src/prompts.ts`
  - Depends: Task 2, 3

- [ ] Task 9: 编排入口
  - Acceptance: `siku install` 完整串起 下载/发现 → 交互 → 安装 → lock → 摘要；错误统一捕获、红字输出、exitCode=1；`--repo/--ref/--source/--project/--user` 生效
  - Verify: 端到端手动验证（项目 + 用户模式、--source 离线）；`npm test`
  - Files: `src/cli.ts`
  - Depends: Task 4-8

### Checkpoint: Interactive
- [ ] 端到端走通；产物结构符合 SPEC 安装目标总表

## Phase 4: Polish

- [ ] Task 10: README + 发布校验
  - Acceptance: cli/README.md（安装/使用/flags）；`npm pack --dry-run` 仅含 dist 与元文件；根 .gitignore 含 cli/dist、cli/node_modules
  - Verify: `npm pack --dry-run`
  - Files: `README.md` `.gitignore`
  - Depends: Task 9
