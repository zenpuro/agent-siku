# siku

把集中维护的 agent 内容（skills / rules / agents-md）安装到任意项目或用户环境。

```
npx siku install
```

## 工作方式

CLI 与内容分离：本包只含安装器；内容在运行时从内容仓库拉取（GitHub API tarball 端点，分支/标签/SHA 通吃）。内容更新 = 内容仓库 git push，CLI 无需重新发布。

仓库链接必传，无内置默认值：`--repo` > `SIKU_REPO` 环境变量 > 交互提示。接受 `owner/repo`、`https://github.com/owner/repo`（可带 `.git`）与 `git@github.com:owner/repo.git`。

私有仓库需认证：预先设置 `SIKU_TOKEN` 或 `GITHUB_TOKEN`（需要对仓库的读权限）；未设置时，拉取遇到 404（GitHub 对无权限的私有仓库同样返回 404）会交互询问 token 后重试。

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
  --repo <link>             Content repo link — required unless --source
                            (owner/repo or a github.com repo URL; SIKU_REPO env
                            and interactive prompt as fallbacks, no default)
  --ref <ref>               Content branch or tag (default main)
  --source <dir>            Read a local content directory directly (dev, offline, skips download)
  --help, -h                Show help
  siku --version            Show version
```

交互提示信息为英文；skills / rules 以树形多选展示（支持搜索、目录级联全选、←→ 折叠/展开、`select all (x/y)` 计数）。

## 开发

```bash
cd cli
npm install
npm run dev -- install --source ../   # 直读本仓库内容，离线调试
npm test / lint / typecheck / build
```

发布：在 `cli/` 目录 `npm publish`，包内仅含 `dist/`（见 `files` 字段），内容目录永不随包发布。
