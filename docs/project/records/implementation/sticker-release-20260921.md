---
id: IMP-sticker-release-20260921
kind: implementation
title: 会话贴纸自持的构建与发布（rc2.26）
status: current
summary: 从 HEAD 313e845 打包 dsh-thoughtdag 0.4.14-rc2.26；产物落 artifacts/architecture-upgrade-20260920/independent-preview-dag-rc2.26，已核验无 maintenance 代码、无 @linmu 依赖。
progress: implemented
gap: 未安装到实例、未重启、真实实例端到端未验收；verify-rc2 第三处缺陷按用户决定先不修。
sources:
- workspace_id: source
  path: dsh/package.json
- workspace_id: source
  path: dsh/scripts/build.mjs
relations:
- relation: implements
  to:
    record_id: DEC-sticker-independent-20260921
---

# 会话贴纸自持的构建与发布（rc2.26）

版本：dsh-thoughtdag **0.4.14-rc2.26**，目标 DSH 0.1.5-rc.2 / web profile。
源码快照：分支 `codex/independent-plugins-20260920`，HEAD **`313e845`**，打包前 `git status --short` 为空。

## 提交

| 提交 | 内容 |
|---|---|
| `f9487a0` | feat(dsh)!: 与 Maintenance 解耦；会话贴纸 = 新会话 + 单向拓扑边（24 files, +1113 −665） |
| `313e845` | docs(project): 记录会话贴纸解耦与自持，并解除 Maintenance 接入绑定（13 files, +237 −79） |

打包点包含以上两个提交。`41b7356`（上一轮地图提交）也在本地但**未推送**；`origin` 仍在 `7b092de`。

## 打包方式与产物

沿用仓库既有 `prepack` 流程，未新增脚本：

```powershell
cd dsh
npm pack          # prepack = npm run build = node scripts/build.mjs ..
```

产物目录：`D:\AI\DeepSeekHarness-Plugin\artifacts\architecture-upgrade-20260920\independent-preview-dag-rc2.26\`

| 文件 | 字节 | SHA-256 |
|---|---|---|
| `dsh-thoughtdag-0.4.14-rc2.26.tgz` | 4906953 | `ed6199d2…46d1283` |
| `BUILD-INFO` | 6816 | `8715f535…615373a` |
| `CONTENTS.txt` | 834 | `90a9ea94…3f804946` |
| `SHA256SUMS` | 258 | — |

包内 33 个文件：`package.json`、`cordis.patch.yml`、`LICENSE`、`README.md`、`MANAGED.md`、`docs/`（3）、`lib/`（5）、`dist-app/`（20，含 3 个构建产物与 8 个教程 gif）。

## dist-app 来源

`npm pack` 触发 `prepack` → `build.mjs` **完整重建**了 `dist-app`：其中 33 个文件的写入时间为本次构建时刻（22:49:21–22），与 tgz（22:49:22）一致；`.dist-tmp` 中间目录已由构建脚本清理。产物自证（在包内 `ManagedGraphApp-*.js` 中逐项核对字符串）：`在当前工作区新建会话` 命中 2、`create-sticker` 1、`current-workspace` 1、`选择新会话所在工作区` **0**、`maintenance-knowledge` **0**。

## 依赖核对

打包后的 `package.json` 中 `devDependencies` 为 `{}`（npm pack 不打包 devDependencies），`@linmu/dsh-session-contracts` 在 dependencies / devDependencies / peerDependencies **三处均不存在**。

## maintenance 命中核对

`lib/` 与 `dist-app/` 的全部文件：**0 处**。全包共 17 处，全在文档/配置里，性质是「明确说不需要它」、安装说明或历史记录（`cordis.patch.yml` 1、`MANAGED.md` 2、`README.md` 5、`docs/INSTALL.md` 5、`docs/RELEASE-20260920.md` 3、`docs/history/2026-09-20-independent-release.md` 1）。逐条清单见 `BUILD-INFO`。

**一处陈旧表述（如实登记，本轮未改）**：`docs/INSTALL.md:86` 称「当前部分源码仍使用本地 contracts/Core/Protocol SDK 路径」。本轮删除了指向维护仓库 worktree 的 `@linmu/dsh-session-contracts` file: 依赖，该句对本次产物已过时。它描述源码构建限制，不影响运行包。

## 用户决定（本轮）

1. **`verify-rc2.mjs` 第三处缺陷先不修**：合成 profile 不供给 `dsh-annotation-core`，插件树停在 `annotationCoreHost` 未就绪。按用户决定「先不修，等以后需要自动回归时再补」。前两处（peer 循环假定所有 peer 都在官方 runtime；inspector 重复 provide 已注册服务）本轮已修并留档。
2. **先出包**：不安装、不重启、不 push、不打 tag。

## 未覆盖范围

- **未安装到实例、未重启**：产物只是安装包。
- 真实实例端到端验收未做：空会话 composer 时序、Core 待发送引用落位仍需装包重启后的实例。
- 没有在浏览器里点过新的贴纸流程。
- `verify-ui.mjs` 的几何对齐断言在本机仍是既有失败（已 A/B 证明与本次改动无关），本轮未修。
