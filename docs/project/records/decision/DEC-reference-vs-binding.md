---
id: DEC-reference-vs-binding
kind: decision
title: 引用归 Core、绑定归 DAG
status: current
summary: 用户明确划定两个概念：引用是 Core 的逻辑，绑定是 DAG 的拓扑逻辑；本轮连线只写拓扑绑定。
sources:
- provider: user
  note: 2026-09-21 用户在本轮开发中直接给出的设计边界，原话见正文
- path: ../../src/maintenance/model.ts
  symbol: bindUpstream
- path: ../../src/maintenance/ManagedGraphApp.tsx
  symbol: beginConnect
- path: ../../dsh/README.md
relations:
- relation: supersedes
  to:
    record_id: ARCH-connect-reads-upstream
- relation: derived_from
  to:
    record_id: REQ-main
- relation: derived_from
  to:
    record_id: REQ-storage
---

# 引用归 Core、绑定归 DAG

## 用户划定的边界（本轮最高优先的设计决定）

2026-09-21 用户在本轮开发中明确要求：

> 引用是引用，绑定是绑定，引用是 core 的逻辑，绑定是 dag 的逻辑
>
> 先不要这个锚点，单纯拓扑绑定
>
> 以末尾的会话为起点

这条要求直接落在连线上，形成本轮的决定：

| 概念 | 归属 | 本轮行为 |
|---|---|---|
| 引用（reference） | Annotation Core | 仍然是唯一读取授权；读取范围固定在引用发送时选定的位置 |
| 绑定（binding） | ThoughtDAG（DAG） | 只记录「谁在上游」的拓扑；不创建 Core 引用、不授权读取、不注入任何上游正文 |
| 锚点 | 本轮从绑定语义里剔除 | 连线不再要求「已完成回复的固定上限」，也不弹确认框；用户明确说「先不要这个锚点」 |
| 起点 | 末尾（接收方）会话 | 关系记在接收会话自己的图里，来源作为上游支流进入该图 |

因此连线的结果是**上游拓扑绑定**（`bound:<source>:<target>`，无 `relationId`），不是引用。连线不再消耗上下文：这是用户要的语义，不是实现偷懒。

## 为什么这是一个需要单独登记的决定

- 它和早期规格的读取方式不同：规格把「拖线/右键连接两个节点」直接写成「建立经确认的固定上游关系」（AC33），并把连线当作确认来源的动作。用户本轮把这两件事拆开了。
- 它带来一个**尚未解决的边界**：绑定只在界面和提示里可见，模型侧没有任何读取上游的手段。绑定不等于读取授权，模型只能通过用户实际提交的引用读取上游。是否新增 `upstreamRead` 风格工具属于未决问题，见 [[IMP-binding-20260921]]、[[REQ-upstream-binding]]。
- 它解释了界面为什么不再出现「确认上下文来源」对话框：该对话框在 2026-09-21 的提交 `595730c` 中被删除，连线改为 `bindUpstream` + `persist`。

## 仍然有效的部分

- 引用仍然走 Core，仍然是读取的唯一入口；撤销、上限固定、披露位置、原生上下文授权窗口都按原规格和 [[DEC-data-boundary]] 执行。
- 绑定不替代引用：可以在一条绑定之上再建立引用，那时该边才成为「投递」，并恢复 `upstream` 边的呈现。
- 图仍然只保留结构与必要短摘录，不复制会话正文（[[REQ-storage]]）。

## 相关记录

- 需求与验收边界：[[REQ-upstream-binding]]
- 实现现状：[[IMP-binding-20260921]]
- 被替代的旧说明：[[ARCH-connect-reads-upstream]]（旧 MOD-canvas 把连线写成「确认固定来源」）
- 数据边界决定：[[DEC-data-boundary]]
