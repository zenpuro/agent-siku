# siku

把集中维护的 agent 内容（skills / rules / agents-md）安装到任意项目或用户环境。

```
npx siku install
```

## 工作方式

CLI 与内容分离：本包只含安装器；内容在运行时从内容仓库 `zenpuro/agent-siku` 拉取（GitHub tarball，公共仓库无需认证）。内容更新 = 内容仓库 git push，CLI 无需重新发布。

## 安装目标

| 内容 | 项目安装（root = cwd） | 用户安装（root = ~） |
|---|---|---|
| skills | `<root>/.agents/skills/` 始终；claude code 另复制到 `<root>/.claude/skills/` | 同左 |
| rules | 仅选 claude code 时写入 `<root>/.claude/rules/`（保留分类子目录） | 同左 |
| agents-md | `<project>/AGENTS.md` | `~/.agents/AGENTS.md`；选 claude code 另生成 `~/.claude/CLAUDE.md` |

- pi / zcode 通过 `.agents/skills/` 读取，无需额外处理。
- 只覆盖本次安装清单内的文件，绝不删除目标目录中的其他内容。
- 安装完成后在 root 写入 `siku-lock.json`（记录来源、ref 与内容哈希），为后续 `update` / `remove` 铺路。

## 用法

```
siku install [options]

  --project                 Install into the current project (skips scope prompt)
  --user                    Install into user home ~ (skips scope prompt)
  --repo <owner/repo>       Content repo (default zenpuro/agent-siku, overridable via SIKU_REPO)
  --ref <ref>               Content branch or tag (default main)
  --source <dir>            Read a local content directory directly (dev, offline, skips download)
  --help, -h                Show help
  siku --version            Show version
```

交互提示信息为英文；skills / rules 以树形多选展示（支持搜索、目录级联全选、`select all (x/y)` 计数）。

## 开发

```bash
cd cli
npm install
npm run dev -- install --source ../   # 直读本仓库内容，离线调试
npm test / lint / typecheck / build
```

发布：在 `cli/` 目录 `npm publish`，包内仅含 `dist/`（见 `files` 字段），内容目录永不随包发布。
