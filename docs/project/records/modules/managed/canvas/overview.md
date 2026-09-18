---
id: MOD-canvas
kind: module
title: 画布编辑和对象操作
status: current
summary: 组织主干目录、卡片/边操作、固定连接、开始会话和恢复入口。
sources:
- path: ../../src/maintenance/ManagedGraphApp.tsx
- path: ../../src/maintenance/managed.css
- path: ../../dsh/MANAGED.md
relations:
- relation: part_of
  to:
    record_id: MOD-managed
- relation: implements
  to:
    record_id: REQ-create
- relation: implements
  to:
    record_id: REQ-remove
---

# 画布编辑和对象操作

ManagedGraphApp 协调当前主干、图目录、工作区/会话分页选择、画布操作和操作反馈。它把用户意图交给图模型及宿主服务，不把可见边线当成权限真源。

## 主要交互

1. 打开思维图时解析当前会话身份，ensure 其唯一主干。普通会话列表浏览不批量建图。
2. 空白处添加已有会话只增加卡片；空卡片先做占位。“开始会话”时选择工作区，先保存创建意图，再明确创建和绑定；重试沿用同一操作与工作区。
3. 连接先确定来源与接收方，并确认已完成回复与固定版本。未绑定卡片之间保留 pending 连接，不能读取上游。
4. 从节点开始时先刷新权威主干；进入非当前主干的节点会转到该会话自己的主干，准备该目标的合法入向引用。
5. 右键、卡片“⋯”、Shift+F10 与 Delete/Backspace 调用相同操作。菜单可滚动、避开视口边缘，Escape/外部点击关闭。

## 保存、同步与错误

保存使用 expectedRevision。后台核对保留尚未保存的布局，同时采用服务器的成员、引用撤销和会话名；[[MOD-graph-state]] 解释合并规则。归档主干只读，保存冲突允许另存无活动权限的布局草稿。

删除先调用 Maintenance 图领域 remove，再清理 Core 的对应引用呈现。若后一步失败，界面保留清理重试项。进入会话失败提供“刷新引用并重试开始”和“返回对话检查”，不能跳过引用准备。

预览与原生上下文交给 [[MOD-source-reading]]；后端接入见 [[IF-maintenance-consumer]]。
