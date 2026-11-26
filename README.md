# agent-siku

把集中维护的 agent 内容（skills / rules / agents-md）安装到任意项目或用户环境。

```
npx @zenpuro/siku install
```

本仓库扮演双重角色：

1. **内容仓库** —— 根目录下的 `skills/`、`rules/`、`agents-md/` 是集中维护的 agent 内容。内容更新只需 git push，无需重新发布 CLI。
2. **CLI 源码** —— [`cli/`](./cli) 目录是 `@zenpuro/siku` npm 包（安装器本体），独立构建与发布。

## 快速开始

在任意项目或用户主目录下运行：

```bash
npx @zenpuro/siku install
```

按提示选择安装范围（项目 / 用户）、内容仓库与要安装的内容即可。需要本机已安装 git。

- 仓库链接必传，无内置默认值：`--repo` > `SIKU_REPO` 环境变量 > 交互提示。接受任意 Git 托管的完整 URL（https / ssh）或裸 `owner/repo`（固定展开为 github.com）。
- 私有仓库认证完全外包给 git：本机已配置好的 SSH key、credential helper（含 `gh auth login`）直接继承，siku 不询问、不存储凭据。CI 等非交互场景可设置 `SIKU_TOKEN` 或 `GITHUB_TOKEN`。

## 安装目标

| 内容      | 项目安装（root = cwd）                                                       | 用户安装（root = ~）                                               |
| --------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| skills    | `<root>/.agents/skills/` 始终；claude code 另复制到 `<root>/.claude/skills/` | 同左                                                               |
| rules     | 仅选 claude code 时写入 `<root>/.claude/rules/`（保留分类子目录）            | 同左                                                               |
| agents-md | `<project>/AGENTS.md`                                                        | `~/.agents/AGENTS.md`；选 claude code 另生成 `~/.claude/CLAUDE.md` |

- pi / zcode 通过 `.agents/skills/` 读取，无需额外处理。
- 只覆盖本次安装清单内的文件，绝不删除目标目录中的其他内容。
- 安装完成后在 root 写入 `siku-lock.json`（记录来源、ref 与内容哈希），为后续 `update` / `remove` 铺路。

## 完整用法

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

交互提示信息为英文；skills / rules / agents-md 以树形多选展示（支持搜索、目录级联全选、←→ 折叠/展开、`select all (x/y)` 计数）。

## 仓库结构

```
skills/          # 技能（按 brand / engineering / pm / productivity 等分类）
rules/           # 规则（common / typescript 等分类）
agents-md/       # AGENTS.md 片段（可按子目录组织，如 workflows/git-review）
cli/             # siku CLI 源码（TypeScript + Node >= 20）
.agents/ .claude/ # 本仓库自身的安装产物（dogfooding，已 gitignore）
```

### 内容目录约定

- `skills/<分类>/<技能名>/SKILL.md` —— 一个目录一个技能，可附带参考文档。
- `rules/<分类>/<规则名>.md` —— 按语言或通用性分类的规则文档。
- `agents-md/<片段名>.md` —— 拼装进目标项目 `AGENTS.md` 的片段，支持子目录任意深度组织，逐个（或按目录级联）勾选后按选择顺序拼接。

## CLI 开发

```bash
cd cli
npm install
npm run dev -- install --source ../   # 直读本仓库内容，离线调试
npm test / lint / typecheck / build
```

### CI / 发布

- **CI**（`.github/workflows/ci.yml`）：PR 与 push 到 main 时自动跑 lint / typecheck / test / build / npm audit（均在 `cli/` 下，Node 24）。
- **自动发布**（`.github/workflows/publish.yml`）：推送 `v*` tag 触发，先校验 tag 与 `cli/package.json` 的 version 一致，再跑全部质量门禁，然后 `npm publish --access public --provenance` 发布到 npm 公共仓库，并自动创建 GitHub Release（generate notes）。预发布版本（version 含 `-`，如 `0.1.1-rc.0`）自动打 npm `next` dist-tag，Release 标记 prerelease，不占 `latest`。
- 发布走 **npm Trusted Publishing（OIDC）**，无需 token，仓库 Secrets 不含 `NPM_TOKEN`。前置配置：在 npmjs.com 为 `@zenpuro/siku` 配置 Trusted Publisher（包 Settings → Trusted Publisher → GitHub Actions），四个字段：Organization or user `zenpuro`、Repository `agent-siku`、Workflow filename `publish.yml`、Environment name `npm-publish`。注意：配置保存后不可修改（只能删除重建），且配置后 2 天内须完成首次成功发布。
- 发布步骤：更新 `cli/package.json` 的 version → 提交 → 打 tag `git tag vX.Y.Z` → `git push origin vX.Y.Z`。
- 包内仅含 `dist/`（见 `files` 字段），内容目录永不随包发布。CLI 与内容分离：本包只含安装器，内容在运行时通过 `git clone --depth 1` 从内容仓库拉取。

详细设计与规格见 [`cli/SPEC.md`](./cli/SPEC.md) 与 [`cli/README.md`](./cli/README.md)。

## License

MIT
