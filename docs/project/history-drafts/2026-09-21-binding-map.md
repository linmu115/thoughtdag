---
id: HIST-binding-map-20260921
kind: history-draft
title: 把「连线只做拓扑绑定」这一轮写进项目地图
date: 2026-09-21
status: current
modules: [画布编辑, 图模型与状态合并, 宿主桥接]
outcome: 地图按仓库证据更新并归档三处旧说明；绑定边保存路径与模型侧读取范围作为未验证项登记
summary: 用户划定引用与绑定分开后，更新需求/模块/接口/证据记录，归档不一致的旧说明，并核对出用户描述与仓库不一致的三处。
applicability: dsh-thoughtdag 0.4.14-rc2.24，分支 codex/independent-plugins-20260920，HEAD 547f9f7；地图目录 docs/project
coverage_note: 由本轮地图维护任务整理，来源是用户本轮任务描述、仓库 Git 历史与测试实跑；本机没有为该任务导入可展开的宿主事件索引，所以这条历程保持未索引草稿形态，不提供 history-event 依据，也不冒充可展开证据的正式 history 记录。
related_records: [IMP-binding-20260921, REQ-upstream-binding, DEC-reference-vs-binding, VER-binding]
sources:
- path: ../source-review-2026-09-21.json
- provider: user
  note: 2026-09-21 用户任务描述中的设计原话，逐字保存于 DEC-reference-vs-binding
---

# 把「连线只做拓扑绑定」这一轮写进项目地图

## 任务与用户反馈

用户要求更新 ThoughtDAG 的项目地图，并把本轮开发（2026-09-20 起）写进去，特别要求把「引用 vs 绑定」的设计边界写成明确的设计决定与来源。用户给出的设计原话是：

- 「引用是引用，绑定是绑定，引用是 core 的逻辑，绑定是 dag 的逻辑」
- 「先不要这个锚点，单纯拓扑绑定」
- 「以末尾的会话为起点」

这三句是本轮的最高优先依据，用户也明确要求：与仓库证据冲突时以仓库为准，并在报告里指出差异。

## 主要尝试与发现

1. **先核对再写**：用 `git log`/`git show` 读五个提交（`132582a`、`595730c`、`8421341`、`6c715a6`、`547f9f7`），并实跑 `node --test src/maintenance/model.test.mjs`（12 项）与 `node --test dsh/tests/*.test.mjs`（21 项），两项都通过。用户描述的大部分事实与提交内容一致。
2. **发现用户描述与仓库不一致的三处**（都按仓库证据登记，见下方「保留边界」）：
   - 用户把 2 项模型测试算作同一次改动，实际分属 `132582a` 与 `595730c`；
   - 用户说保存校验放宽使绑定边可保存，实际只放宽了按 `relationId` 的授权核对，`validateSessionGraph` 的边类型白名单仍拒绝 `bound`；
   - 用户说 `dsh/README.md` 记录了「原生会话与思维图切换」，该标题当前不存在，插件 README 已被重写。
3. **地图自身的入账前提已经坏了**：`project_map.py validate` 一开始就失败——原先绑定到 `dsh/MANAGED.md` 的四个标题（使用流程、主干与迁移、能力与边界、开发验证）在该文件被重写为单标题后全部不存在；同时规格工作树的相对路径多出一层 `repositories`。先修好这两件事，地图才可能校验通过。
4. **归档机制的限制（人工纠偏）**：尝试用 `project_map.py archive-record` 归档被替代的说明，脚本在读取外部绑定来源时报「Cannot read UTF-8 file …worktrees\session-context-graph-20260913\…」。在临时副本上重复探测后确认这是脚本对该地图外部路径的解析问题，不是记录内容问题（系统提示本身建议直接读文档并遵守规则）。于是按归档机制的产物要求人工完成：原正文按字节保存到 `archive/records/`、记录 SHA-256、原路径写入短定位条目，并在 `archive/.gitattributes` 上加 `records/** -text whitespace=cr-at-eol` 以保住指纹。地图没有改代码、没有提交 Git。
5. **收尾校验**：`project_map.py validate` 通过；原生架构图与流程图按新语义更新后重新校验通过，阅读页已重新导出。本次没有重启实例、没有打开浏览器阅读页。

## 补充核对：测试基线与发布痕迹（同轮，由 Core 地图核对结果触发）

6. **既有基线失败**：跑 `npx vitest run` 得到 3 文件 / 30 用例 → 21 通过、**9 失败**，全部来自 `tests/session-stickers.test.tsx`；另跑 `node --test src/maintenance/*.test.mjs` 得 43 项全通过。核对结论与转述有出入，按仓库证据更正两点：
   - 贴纸那 9 项是 **断言失败**（`AssertionError: expected undefined to be truthy`，位置 `tests/session-stickers.test.tsx:26` 的按钮查找），不是 React act() 警告；只是调用栈经过 `act` 帧容易误读。
   - 「未改动文件上也失败」成立：该测试文件最后修改是 `aab4148`（2026-09-18），被测组件不在本轮改动里，且工作树除 `docs/project/` 外干净。
   - 无法复现的部分：`src/maintenance/graph-ui.test.mjs` 在本轮跑了 4 次都是 7 项全通过（含与其他维护层测试一起跑的一次），没有观察到拖拽时序 flake，因此只登记为「未复现」，没有写成基线失败，也没有写成已修复。
   - 本仓库 vitest 只覆盖 3 个文件 30 个用例；别的项目 vitest 全绿不覆盖它们。
7. **发布痕迹**：`independent-preview-r23/BUILD-INFO.json` 显示 rc2.24 包由 `8421341`（`sourceDirty: true`）打包，早于 `6c715a6` 与 `547f9f7`，包内 `dag-README.md` 因此缺少后者新增的已知问题一节；该文件第 45 行的「打开贴纸对象跳转失败（未修复）」与仓库 HEAD 的 `dsh/README.md` 一致。安装指南 `dsh/docs/INSTALL.md` 的版本行从 rc2.20（`dbcea3f`）沿四个提交走到 rc2.24，当前**没有**未提交改动——这一点与转述的「未提交的 INSTALL.md 改动」不符，按仓库证据登记。

## 结果

- 新增：[[DEC-reference-vs-binding]]（设计决定与用户原话）、[[REQ-upstream-binding]]（当前要求/实现进度/实际验证范围三态分开）、[[IMP-binding-20260921]]（实现现状与三项未修）、[[VER-binding]]（测试范围与不能推出的结论）、[[IF-upstream-notice]]（提示注入的交接约定）。
- 更新：[[IMP-current]]、[[OBJ-main]]、[[IF-integration]]、[[MOD-managed]]、[[MOD-canvas]]、[[MOD-host-shell]]、[[MOD-graph-state]]、[[DEC-data-boundary]]、[[VER-product-evidence]]、[[VER-adoption]]、`map.md`、`project.yaml`、两张原生图。
- 归档：[[ARCH-connect-reads-upstream]]（旧「连线即确认固定来源」读法）、[[IMP-usage]]（旧 MANAGED 使用流程绑定）、[[IF-capability]]（旧能力与边界绑定）。

## 保留边界与未决

- 绑定边能否真正落盘未验证，且已知会被 `validateSessionGraph` 拒绝；本轮按「已核对但未修」登记。
- 上游绑定对模型不可读：绑定不等于读取授权，是否新增 `upstreamRead` 风格工具待与用户确认。
- 贴纸对象跳转不可用，属已知未修；r23 发布说明与仓库 README 一致记录了它。
- 仓库测试基线不是全绿：贴纸测试 9 项既有失败（未修、非本轮引入）；图 UI 拖拽 flake 本轮未复现，需要其他环境各自复核。
- 本轮没有页面级验收，也没有重跑 2026-09-20 的 59 项批次。
- 本记录没有可展开的宿主事件索引；如需逐条依据，需由人或模型另行指定会话文件与行范围。
