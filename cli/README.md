# siku

把集中维护的 agent 内容（skills / rules / agents-md）安装到任意项目或用户环境。

```
npx siku install
```

## 工作方式

CLI 与内容分离：本包只含安装器；内容在运行时通过 `git clone --depth 1` 从内容仓库拉取。内容更新 = 内容仓库 git push，CLI 无需重新发布。需要本机安装 git。

仓库链接必传，无内置默认值：`--repo` > `SIKU_REPO` 环境变量 > 交互提示。接受任意 Git 托管的完整 URL（https / ssh）或裸 `owner/repo`（固定展开为 github.com）；`--ref` 仅支持分支/标签。

私有仓库认证外包给 git：本机已配置好的 SSH key、credential helper（含 `gh auth login`）直接继承，siku 不询问、不存储凭据。CI 等非交互场景可设置 `SIKU_TOKEN` 或 `GITHUB_TOKEN`，将以 basic-auth 嵌入 HTTPS clone URL。

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
                            (owner/repo, a https/ssh git URL, or git@host:path; any git host works;
                            falls back to SIKU_REPO env, then interactive prompt)
  --ref <ref>               Content branch or tag (default main; commit SHAs unsupported)
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
