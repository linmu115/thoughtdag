---
id: ARCH-connect-reads-upstream
kind: decision
title: 旧读法：连线确认固定来源并固定读取上限
status: superseded
summary: 连线曾被视为「确认固定来源」的动作：先确定来源与接收方，再选择或确认来源的已完成回复并固定上限。
sources:
- path: ../../../../worktrees/session-context-graph-20260913/dsh-session-maintenance/docs/superpowers/specs/2026-09-10-session-context-graph-requirements.md
---

# 旧读法：连线确认固定来源并固定读取上限

> 归档正文。本文件是 2026-09-21 之前地图对「连线」的读法，已由用户决定替代。保留原文是为了让后来者看清语义从哪里改变。

## 旧读法的内容

- 拖动连接点或右键「连接到节点」是同一个领域命令：先确定来源与接收方，**再选择或明确确认来源的已完成回复并固定上限**。
- 当前选文带来的回复可以直接复用；无已完成回复的空节点只能保存待绑定连接，不能宣称上游可读。
- 因此连线会创建 Core 引用，并把读取范围固定在那次确认的位置上；「确认上下文来源」对话框就是这一步的界面。
- 连线不运行模型；来源后续追加不刷新既有上限，已经解除的连接不得通过重新进入会话再次附加。

## 规格出处（提供方原文未改动）

摘自 `2026-09-10-session-context-graph-requirements.md`（工作树 `D:\AI\DeepSeekHarness-Plugin\worktrees\session-context-graph-20260913\dsh-session-maintenance`，指纹 `671d89b30fe5c68fa810fcff7da6d8a266026c5fcc0a2590500c3064f36602c9`）：

- 5.3 连接段落（第 205 行）：「…拖动连接点和右键连接使用同一领域命令：先确定来源与接收方，再选择或明确确认来源的已完成回复并固定上限。当前选文带来的回复可直接复用；无已完成回复的空节点只能保存待绑定连接，不能宣称上游可读。连线不运行模型。」
- 验收 AC33（第 415 行）：「拖线或右键连接两个节点 → 建立经确认的固定上游关系；空节点显示待绑定，不把知识线或未完成回复直接授权。」

## 为什么被替代

用户 2026-09-21 明确要求「引用是引用，绑定是绑定，引用是 core 的逻辑，绑定是 dag 的逻辑」「先不要这个锚点，单纯拓扑绑定」「以末尾的会话为起点」。连线因此只写 `bound:<source>:<target>` 拓扑边，不确认回复、不固定上限、不创建引用。仍然成立的意图是：添加卡片不自动授权，图里有边不等于模型已读。

当前说明：`DEC-reference-vs-binding`、`REQ-upstream-binding`、`IMP-binding-20260921`。
