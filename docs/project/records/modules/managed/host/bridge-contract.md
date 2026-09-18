---
id: IF-host-bridge
kind: interface
title: 嵌入画布与当前宿主的交接
status: current
summary: iframe 通过同源请求读取/保存图，通过父窗口请求进入会话与操作引用。
sources:
- path: ../../src/maintenance/client.ts
- path: ../../dsh/lib/client.js
- path: ../../dsh/lib/managed-graph.js
---

# 嵌入画布与当前宿主的交接

这份约定属于 ThoughtDAG 自己。画布把“打开这个会话”“保存这个布局”等意图交给当前宿主，宿主返回目标身份、图修订或错误；Maintenance 与 Core 的完整领域合同仍在提供方。

## 两条通道

| 通道 | 画布交付 | 宿主返回/执行 |
|---|---|---|
| 同源 HTTP /thoughtdag/api/managed | 目录、身份、固定预览、图操作、原生上下文操作 | 当前实例服务的有界结果；save/bind/remove 携带 expectedRevision |
| 父窗口 td:managed-request | open-session、add-reference、delete-reference、open-object、session-sticker | 按 requestId 返回 td:managed-result；导航、Core 动作或打开外部对象 |
| 父窗口状态通知 | 当前会话、图关系变化和可见性 | 画布重核当前身份、刷新权威状态并控制刷新周期 |

例如，画布提供解析后的原生会话 ID 和合法入向引用 ID；父窗口先重新解析目标，再请 Core 准备这些引用，最后打开真实会话。原有草稿与附件保留，用户自己发送。

postMessage 只接受相同窗口来源与匹配的请求身份。超时、取消、能力缺失和服务拒绝要反馈给操作界面；不确定写入不能据一次超时断言失败。完整操作类型和实现依据见 [客户端类型](../../../../../../src/maintenance/client.ts)、[宿主客户端](../../../../../../dsh/lib/client.js)和[服务器分派](../../../../../../dsh/lib/managed-graph.js)。
