---
id: REQ-upstream-binding
kind: requirement
title: 连线只做上游拓扑绑定
status: current
summary: 用户要求连线只能产生上游拓扑绑定：不创建 Core 引用、不弹确认框、不读取或注入上游正文。
progress: implemented
gap: 绑定对模型不可读（绑定不等于读取授权）；是否新增 upstreamRead 风格工具未决定。贴纸对象跳转仍未修复。
sources:
- provider: user
  note: 2026-09-21 用户原话「引用是引用，绑定是绑定，引用是 core 的逻辑，绑定是 dag 的逻辑」「先不要这个锚点，单纯拓扑绑定」「以末尾的会话为起点」
- path: ../../src/maintenance/model.ts
  symbol: bindUpstream
- path: ../../src/maintenance/ManagedGraphApp.tsx
  symbol: beginConnect
- path: ../../dsh/README.md
relations:
- relation: derived_from
  to:
    record_id: DEC-reference-vs-binding
- relation: implements
  to:
    record_id: REQ-main
---

# 连线只做上游拓扑绑定

## 当前要求（用户 2026-09-21 划定）

1. 画布上把两张真实会话卡片连起来的动作，只产生一条**上游拓扑绑定**：接收会话是下游，来源会话是上游。
2. 连线**不得**创建 Core 引用、不得弹「确认上下文来源」这类确认框、不得读取上游正文、不得把上游内容注入任何会话。
3. 绑定不带锚点：「先不要这个锚点」。连线不要求来源存在已完成回复，也不固定读取上限。
4. 起点是末尾的会话：关系记在接收会话自己的图里，来源作为它的上游支流。
5. 绑定必须可保存、可重开、可幂等：重复连同一对卡片不再产生第二条边。
6. 已有授权关系的显示不能被绑定改动破坏：打开图时，已有 Core 引用若还没有对应的边，应当补成边显示。

## 实现进度

**已实现**（源码见 [[IMP-binding-20260921]]）：

- `bindUpstream(graph, source, target)` 写边 `bound:<source>:<target>`，`data.kind = 'bound'`，没有 `relationId`、没有 `namespace`；自连接和未知端点直接返回原图。
- `beginConnect` 只做 `bindUpstream` + `persist`，原预览对话框、`ConnectionDraft`、`confirmConnection`、`connection` state 已删除。
- `relationPresentation` 把无 `relationId` 的 `bound` 边呈现为知识状态（非 muted、虚线），标签「上游绑定」。
- `dsh/lib/session-graph.js` 保存时的授权核对只过滤带 `relationId` 的边，因此绑定边不再被这条核对拦住。
- `loadDocument` 会 `await managedApi.relations(owner)` 后 `reconcileRelationEdges`，用 `sameEdges` 判断是否真的需要写回，把导入关系补齐为边。
- `dsh/lib/managed-entry.js` 通过 `systemPrompt.context()` 注入 `<dsh-thoughtdag-upstream>` 区块，逐条列出上游绑定与已有固定来源引用，并写明「这是拓扑信息，不是内容授权」。

## 实际验证范围

**已由测试覆盖**（[[VER-binding]]）：边模型的幂等、无 `relationId`、自连接/未知端点拒绝、呈现状态；上游说明的三种情形（无绑定不占上下文、拓扑与引用分别列出、未知标签回退为节点 id）。

**尚未验证**：

- 没有端到端验证「连线后保存成功且重开后边还在」的真实页面流程。本轮只做到源码与测试层。
- 没有验证服务端保存校验对 `bound` 边的完整放行：`validateSessionGraph` 的边类型白名单仍是 `['pending', 'upstream', 'branch']`，绑定边可能被它拒绝，见 [[IMP-binding-20260921]] 的「已核对但未修」一节。
- 没有验证真实模型侧能否读到上游内容——按当前设计它读不到。

## 与早期规格的关系

早期规格的 AC33 把「拖线或右键连接两个节点」写成「建立经确认的固定上游关系」，并把「选择或明确确认来源的已完成回复并固定上限」当作连线的一部分。用户本轮把这两件事拆开，因此该存档读法被替代，原文与替代关系见 [[ARCH-connect-reads-upstream]]。规格中「添加卡片不自动授权」「图里有边不等于模型已读」的意图本身仍然有效，与本轮要求一致。

## 未决问题

- **绑定对模型不可读**：绑定不等于读取授权。模型只能通过用户实际提交的引用读取上游（Core 的 `dsh_upstream_read` / `dsh_upstream_search` 只接受已提交引用的 `referenceId`）。是否新增 `upstreamRead` 风格工具、读取范围如何限定、从哪个起点读，尚未与用户确认，本轮不实施。
- **贴纸对象跳转不可用**：已知未修，见 [[IMP-binding-20260921]]。
