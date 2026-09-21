# Todo: siku CLI

> 计划详见 `plan.md`；规格详见 `../SPEC.md`。

## Phase 1: Foundation

- [x] Task 1: 脚手架 ✅ commit 2b66b11
  - Notes: 本沙箱中 bash→native 进程的 PATH 在 ~100 字符处截断导致 npm 脚本找不到 node，绕过：命令前加 `export PATH="/d/software/Node:$PATH"`（用户本机终端不受影响）。网络抖动时可用 `--registry=https://registry.npmmirror.com` 补装。

## Phase 2: Core Domain

- [x] Task 2: agent 注册表 ✅ commit 76cd023
- [x] Task 3: 内容发现（本地扫描）✅ commit 7747186（fixtures 改为测试内程序化构建，减少仓库噪音）
- [x] Task 4: 内容下载（远端）✅ commit bf4bfaa（独立成 download.ts，SPEC 已同步；codeload heads→tags 回退）
- [x] Task 5: 安装引擎 ✅ commit bf4bfaa 之前单独提交（同名冲突先到先得+警告；只覆盖清单内文件）
- [x] Task 6: AGENTS.md ✅ commit 36468b1（新文件纯内容无标记；已有文件追加走幂等标记区块）
- [x] Task 7: lock 文件 ✅ commit 36468b1

### Checkpoint: Core Domain
- [x] 40 个单测/集成测试全绿；lint/typecheck 通过

## Phase 3: Interactive + Wiring

- [x] Task 8: 交互层 ✅ commit b3d1c2f（skills/rules 用 autocompleteMultiselect 实现可搜索多选）
- [x] Task 9: 编排入口 ✅ commit b3d1c2f + 869bf22
  - Notes: 安装核心抽为 `performInstall`（纯逻辑可测）；runInstall 只负责取内容+收集交互答案。
  - Verify: 集成测试覆盖编排全链路；**交互层冒烟需真实 TTY**——请在终端运行 `cd cli && npm run dev -- install --source ../` 走一遍完整流程（本沙箱无 TTY，已验证渲染正常但无法按键）。

### Checkpoint: Interactive
- [x] `performInstall` 端到端集成测试通过（项目/用户两种模式）
- [ ] （待用户）真实终端交互冒烟一次

## Phase 4: Polish

- [x] Task 10: README + 发布校验 ✅
  - `npm pack --dry-run`：仅 README.md + dist/cli.mjs + package.json，无内容目录 ✅
  - cli/README.md 完成；根 .gitignore 已含 cli/dist、cli/node_modules
