# Implementation Plan: siku CLI

## Overview

按 `cli/SPEC.md` 实现 npm 包 `siku`：交互式安装器，把 `zenpuro/agent-siku` 仓库的 skills / rules / agents-md 装到项目或用户环境。CLI 与内容分离，内容运行时从 GitHub 拉取。

## Architecture Decisions

- **子命令形态**：`siku install` 为唯一内容安装入口；裸 `siku` 打印用法。为 `update` / `remove` 预留。
- **分层**：`prompts.ts`（交互薄层，无 fs 逻辑）→ `installer.ts` / `agents-md.ts` / `lock.ts`（纯逻辑，可单测）→ `cli.ts`（编排）。content 层通过注入 fetch/extract 依赖实现可测。
- **发现约定**：技能 = 含 `SKILL.md` 的目录（任意深度）；规则 = `rules/<分类>/<文件>.md`；agents-md = 目录内 `.md` 排序拼接。
- **安全边界**：只覆盖本次清单内文件，绝不删除既有内容；tar 解压剥离顶层目录并拒绝 `..` / 绝对路径条目。

## Task List

### Phase 1: Foundation

- [ ] Task 1: 脚手架 —— cli/package.json、tsconfig、tsdown、vitest、biome 配置；src/constants.ts、src/types.ts；cli.ts 骨架（`--help` / `--version` / 参数解析）

### Checkpoint: Foundation
- [ ] `npm run build` 产出 dist/cli.mjs；typecheck / lint / test 全绿；`node dist/cli.mjs --help` 正常

### Phase 2: Core Domain（纯逻辑，TDD）

- [ ] Task 2: agent 注册表 —— agents.ts（claude-code / pi / zcode，detectInstalled，generateClaudeArtifacts）
- [ ] Task 3: 内容发现 —— content.ts 本地扫描（scanSkills / scanRules / readAgentsMdFiles）+ fixtures
- [ ] Task 4: 内容下载 —— content.ts 远端（fetchTarball 注入 fetch、tar 解压、顶层目录剥离、路径 sanitize）
- [ ] Task 5: 安装引擎 —— installer.ts（目标规划 + 逐文件复制；claude-code 派生 .claude/skills；同名冲突跳过并警告）
- [ ] Task 6: AGENTS.md —— agents-md.ts（拼接内容、覆盖/追加标记区块/跳过、幂等）
- [ ] Task 7: lock 文件 —— lock.ts（聚合 sha256、构建、写入）

### Checkpoint: Core Domain
- [ ] 全部单测通过；installer / agents-md / lock / content 分支覆盖

### Phase 3: Interactive + Wiring

- [ ] Task 8: prompts.ts —— clack 全流程（scope / agents 多选预选 / skills 可搜索多选 / rules / agents-md 冲突三选）
- [ ] Task 9: cli.ts 编排 —— 完整 `siku install` 流程、错误处理、安装摘要打印；`--source` 离线端到端手动验证

### Checkpoint: Interactive
- [ ] `siku install --source <repo>` 端到端走通（项目 + 用户两种模式）

### Phase 4: Polish

- [ ] Task 10: README + 发布校验 —— cli/README.md；`npm pack --dry-run` 仅含 dist；根 .gitignore 补 cli/dist 与 cli/node_modules

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| tar 解压路径穿越 | High | entry 路径 sanitize（拒绝绝对路径与 `..` 段），解压后只取唯一顶层目录 |
| codeload 顶层目录名不可预知 | Med | 剥离第一层路径分量，而非假设固定前缀 |
| 同名技能目录冲突 | Low | 跳过 + 黄字警告，installer 单测覆盖 |
| clack 多选值建模混乱 | Low | `dir:` / `skill:` 前缀约定集中在 prompts.ts 转换 |

## Open Questions

（无）
