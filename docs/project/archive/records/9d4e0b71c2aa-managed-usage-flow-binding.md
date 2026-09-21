---
id: IMP-usage
kind: requirement
title: 归档：dsh/MANAGED.md「使用流程」的旧绑定
status: superseded
summary: 旧绑定把连线写成「先确定来源与接收方，再确认已完成回复并固定上限」；MANAGED.md 被重写为单标题后该章节已不存在，且该读法已被用户 2026-09-21 的决定替代。
sources:
- path: ../../../../worktrees/session-context-graph-20260913/dsh-session-maintenance/docs/superpowers/specs/2026-09-10-session-context-graph-requirements.md
---

# 归档：dsh/MANAGED.md「使用流程」旧绑定（IMP-usage）

> 本文件保存被替代的旧绑定读法与来源摘录。当前说明见 `DEC-reference-vs-binding`、`IMP-binding-20260921` 与 `IF-integration`。

归档时间：2026-09-21。归档者：本轮项目地图维护（模型整理，依据原始文件与 Git 历史）。

原位置：`dsh/MANAGED.md` 的 `## 使用流程` 章节（绑定 ID `IMP-usage`）。
原始文件指纹：`ff82fbee7a6f1c26911f0b930ebbeb7db3f7af163996ea2b134cf7d332d0ec97`（2026-09-16 核对记录中的 MANAGED.md）。
该章节在第 3 阶段的独立架构提交 `3cc4713` 中被重写，MANAGED.md 现在只有单一标题《会话图的数据与接入边界》并指向 `dsh/docs/INSTALL.md`；原章节与旧绑定正文的完整字节仍保留在本仓库 Git 历史中（`git show 3cc4713^:dsh/MANAGED.md`）。

同一份 MANAGED.md 的 `## 能力与边界` 章节属于绑定 `IF-capability`，同时被替代：其中列出的能力门槛是 `maintenanceGraph.protocolVersion === 2` 与 `graph-reference-actions-v1`、`session-main-graph-v2`；独立架构下图的持久化改为经 Core 的会话数据端口（`dsh/lib/session-graph.js`），当前说明在 `IF-integration` 与 `IF-host-bridge`。

## 规格来源的同义读法（已归档的旧读法）

以下摘自 `docs/superpowers/specs/2026-09-10-session-context-graph-requirements.md`（工作树 `D:\AI\DeepSeekHarness-Plugin\worktrees\session-context-graph-20260913\dsh-session-maintenance`，指纹 `671d89b30fe5c68fa810fcff7da6d8a266026c5fcc0a2590500c3064f36602c9`）。提供方原文未改动，此处只保存与本次归档相关的摘录：

- 5.3 连接段落（第 205 行）：「仅添加已有会话卡片不会自动建立上下文。拖动连接点和右键连接使用同一领域命令：先确定来源与接收方，再选择或明确确认来源的已完成回复并固定上限。当前选文带来的回复可直接复用；无已完成回复的空节点只能保存待绑定连接，不能宣称上游可读。连线不运行模型。」
- 验收项 AC33（第 415 行）：「拖线或右键连接两个节点 → 建立经确认的固定上游关系；空节点显示待绑定，不把知识线或未完成回复直接授权。」

## 为什么归档

用户在 2026-09-21 明确划定「引用是引用，绑定是绑定，引用是 core 的逻辑，绑定是 dag 的逻辑」「先不要这个锚点，单纯拓扑绑定」「以末尾的会话为起点」。连线因此只写上游拓扑绑定（`bound:<source>:<target>`，无 `relationId`），不再确认已完成回复、不再固定上限、不再创建 Core 引用。上述旧读法与当前实现不一致，故归档；其意图中「添加卡片不自动授权」「图里有边不等于模型已读」仍然成立，并已保留在当前说明中。

当前说明：`DEC-reference-vs-binding`（引用归 Core、绑定归 DAG）与 `IMP-binding-20260921`（实现现状）。
