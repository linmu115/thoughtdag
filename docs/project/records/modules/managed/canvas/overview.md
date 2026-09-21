---
id: MOD-canvas
kind: module
title: 画布编辑和对象操作
status: current
summary: 组织主干目录、卡片/边操作、拓扑绑定、开始会话和恢复入口。
sources:
- path: ../../src/maintenance/ManagedGraphApp.tsx
- path: ../../src/maintenance/managed.css
relations:
- relation: part_of
  to:
    record_id: MOD-managed
- relation: implements
  to:
    record_id: REQ-create
- relation: implements
  to:
    record_id: REQ-upstream-binding
- relation: implements
  to:
    record_id: REQ-remove
---

# 画布编辑和对象操作

ManagedGraphApp 协调当前主干、图目录、工作区/会话分页选择、画布操作和操作反馈。它把用户意图交给图模型及宿主服务，不把可见边线当成权限真源：**图里有一条边只说明拓扑，不说明模型读过上游**。

## 主要交互

1. 打开思维图时解析当前会话身份，ensure 其唯一主干；打开时会把已有 Core 授权关系补齐为画布上的边（幂等，边集合没变就不写回）。普通会话列表浏览不批量建图。
2. 空白处添加已有会话只增加卡片；空卡片先做占位。“开始会话”时选择工作区，先保存创建意图，再明确创建和绑定；重试沿用同一操作与工作区。
3. **连接只发布上游拓扑绑定**：`beginConnect` 调 `bindUpstream`（边 `bound:<source>:<target>`）后直接 `persist`，不创建引用、不弹确认框、不读取上游正文，提示为「已绑定上游；未创建引用，也未读取内容」。未绑定卡片之间仍保留 pending 连接。
4. 需要真正读取上游内容时，引用是另一件独立的事，仍走 Core 的引用流程（[[DEC-reference-vs-binding]]）。
5. 从节点开始时先刷新权威主干；进入非当前主干的节点会转到该会话自己的主干，准备该目标的合法入向引用。
6. 右键、卡片“⋯”、Shift+F10 与 Delete/Backspace 调用相同操作。菜单可滚动、避开视口边缘，Escape/外部点击关闭。

## 保存、同步与错误

保存使用 expectedRevision。后台核对保留尚未保存的布局，同时采用服务器的成员、引用撤销和会话名；[[MOD-graph-state]] 解释合并规则。归档主干只读，保存冲突允许另存无活动权限的布局草稿。

删除通过 Core 会话数据端口的领域操作解除对应引用，再清理界面呈现；若后一步失败，界面保留清理重试项。进入会话失败提供“刷新引用并重试开始”和“返回对话检查”，不能跳过引用准备。

已知未修：打开贴纸对象的跳转仍失败（发送的是 `logicalSessionId`，宿主只接受二选一且校验严格）。预览与原生上下文交给 [[MOD-source-reading]]；后端接入见 [[IF-host-bridge]] 与 [[IF-suite-consumer]]。

2026-09-21 归档前的旧版本页说明（把连接写成确认固定来源）见 [[ARCH-canvas-module-old-description]]。
