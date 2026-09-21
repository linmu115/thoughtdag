---
id: EXP-archive-record-external-source
kind: experience-draft
title: archive-record 在这张地图上读不到外部绑定来源时的做法
date: 2026-09-21
status: current
modules: [项目地图]
task_id: HIST-binding-map-20260921
categories: [debugging, human-correction]
results: [failed, adopted]
outcome: 脚本归档失败后按归档机制的产物要求人工完成，原文字节与指纹保留
summary: project_map.py archive-record 解析该地图的外部绑定路径时读不到位，改用人工归档并保留同一套元数据与指纹。
applicability: 地图 docs/project 与其来源位于不同工作树（本机为 D:\AI\DeepSeekHarness-Plugin\worktrees\…）时；脚本版本为本机 maintain-project-map 技能自带
coverage_note: 由本轮地图维护任务整理；探测在 docs/project 下的临时副本进行，之后已删除，未改动源码仓库。本文件的历史草稿形态是未索引说明：本轮没有可导入的宿主事件索引，因此不使用 records/history/ 下的正式 experience 身份，也不伪造 history-event 依据。
related_records: [IMP-usage, IF-capability, ARCH-connect-reads-upstream, HIST-binding-map-20260921]
sources:
- path: ../source-review-2026-09-21.json
---

# archive-record 在这张地图上读不到外部绑定来源时的做法

## 问题

对 `docs/project/project.yaml` 里绑定到外部 Markdown 的记录执行：

```text
python "<skill>/scripts/project_map.py" archive-record "docs/project" "IMP-usage" --reason "…" --evidence "…"
```

返回的不是记录内容问题，而是文件读取失败：

```text
Cannot read UTF-8 file D:\AI\DeepSeekHarness-Plugin\repositories\worktrees\session-context-graph-20260913\dsh-session-maintenance\docs\superpowers\specs\2026-09-10-session-context-graph-requirements.md
```

该路径比真实位置多了一层 `repositories`。真实文件在 `D:\AI\DeepSeekHarness-Plugin\worktrees\…`，`project_map.py read/validate` 在修正清单写法后能正常解析同一份来源。

## 尝试

1. 直接把清单里的来源改成 `workspace_id: spec-worktree` + `path: docs/…`：脚本按地图目录解析，得到的路径更偏（变成 `docs/project/docs/…`），`validate` 直接失败，因此改回显式相对路径。
2. 在项目目录内复制一份地图到临时子目录后重跑归档，错误路径随之变化（指向副本下的 `docs/…`），说明这是脚本对 Workspace/source 的解析范围问题，不是清单笔误。
3. 放弃脚本归档，改为人工完成，并让产物与机制的约定一致。

## 采用的做法（人工归档步骤）

1. 原正文按字节另存到 `archive/records/<前缀>-<名字>.md`。
2. 计算该文件的 SHA-256，写入原路径短定位条目的 `documentation.sha256`；同时写 `archive_path`、`reason`、`evidence`、`archived_at`、`original_path`、`map_version`、`successor`、`current_gap`。
3. 原路径只留短定位正文（原因 + 当前说明 + 「需要旧正文时显式查看历史」）。
4. 在 `archive/.gitattributes` 写 `records/** -text whitespace=cr-at-eol`，避免 Git 换行转换破坏指纹。
5. 外部来源文件一个字都不改；被替代的读法用一条归档记录承载（本例为 [[ARCH-connect-reads-upstream]]），把原文摘录与替代关系写在里面。

## 何时不要这样做

只有在脚本确实读不到来源时才人工归档，并且必须同时保留原文字节与指纹。若脚本可用，应优先用脚本，避免自造格式。归档前也要确认旧说明真的与当前实现不一致，不能只因为源文件变了就归档——本轮归档的三条都有明确依据：标题已不存在、或旧读法已被用户决定替代。

## 人工归档必须对齐「身份配对」这条机制约束

第一遍人工归档后 `search/read --include-history` 仍然报错，逐条排查后确认机制要求（都来自 project_map.py 的读取代码，不是可选风格）：

1. **归档正文文件的 frontmatter id 必须等于它所属记录的 id**：否则 `read --include-history` 报「Archive record identity mismatch」。
2. **每条归档记录只能指向一份归档正文**：两条记录（IMP-usage、IF-capability）共用一份正文时，正文的 id 只能等于其中一条，另一条必然报身份不符。因此要按记录各存一份正文（本例用不同文件名区分）。
3. **`archive/records/` 下的每份正文都必须有 frontmatter**：否则 `--include-history` 会把整个索引读崩，报「owned records require YAML frontmatter」。
4. **绑定记录的短定位留在 project.yaml 的 binding 条目里**（`documentation:` 元数据），文件形式的短定位条目只适用于地图自有的 `records/` 记录。绑定条目里再写的 `records/.../*.md` 同名短定位文件会与真正的记录 ID 冲突（duplicate_id）。
5. 改归档正文的任何一个字节（哪怕只是标题）都会改变 SHA-256，必须同步更新记录里声明的 `sha256`，否则读取时报「Archived snapshot changed」。

## 结论

`results: failed, adopted`：脚本路径失败保留，人工归档的做法被本轮采用。脚本行为是否属于缺陷不属于本项目地图的判断范围，本记录只描述在本机遇到的现象与替代做法。
