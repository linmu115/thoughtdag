---
id: IF-maintenance-consumer
kind: interface
title: ThoughtDAG 接入 Maintenance
status: current
summary: 按具体能力消费图领域、扩展读取、原生上下文和创建服务。
sources:
- path: ../../dsh/lib/managed-graph.js
- path: ../../src/maintenance/client.ts
- path: ../../src/maintenance/SourceContextPanel.tsx
relations:
- relation: consumes
  to:
    record_id: IF-graph
    project_id: 0d05f813-7097-47d9-9e88-3d523bb537d6
  reason: ensure/load/save/bind/remove、身份与固定预览、relations/disclosures
- relation: consumes
  to:
    record_id: IF-extension
    project_id: 0d05f813-7097-47d9-9e88-3d523bb537d6
  reason: 画布目录及部分已有对象的list/get；图写入使用IF-graph
- relation: consumes
  to:
    record_id: IF-native-context
    project_id: 0d05f813-7097-47d9-9e88-3d523bb537d6
  reason: 来源面板经requestAsUser读取状态/请求目录并调整窗口、暂停、固定和释放
---

# ThoughtDAG 接入 Maintenance

Maintenance 是独立项目 0d05f813-7097-47d9-9e88-3d523bb537d6。唯一合同按本页关系中的项目 ID 与条目 ID 定位：IF-graph、IF-extension、IF-native-context。本页只解释 ThoughtDAG 实际怎么用它们。

| 插件能力 | 实际调用 | 归属与约束 |
|---|---|---|
| 当前会话主干、保存/绑定/删除 | maintenanceGraph 的 ensure/load/save/bind/remove（协议 2） | Maintenance 决定唯一主干、修订、撤销和迁移；本地只提交布局与明确对象 |
| 会话选择、固定来源、引用/披露位置 | maintenanceGraph 的 directory/resolve/preview/relations/disclosures | 来源版本、锚点及游标保持一致；不可用时不改读最新 |
| 图列表与已有对象 | maintenanceExtensionData.bridge 的 thoughtdag list；annotation/obsidian-links 的 list/get | 读取有界对象；图列表过滤 disclosures-* 日志对象但保留游标；不经 bridge 写图 |
| 贴纸对象、工作区和创建会话 | maintenanceKnowledge.request(list/get stickers)；dispatch(create-workspaces/create-session) | 是独立调用点，不代表插件使用该服务的全局网络功能 |
| 来源上下文面板 | maintenanceNativeContext.requestAsUser | 用户当前会话身份由 Host 固定；UI 只消费状态和领域操作，不实现 Agent 释放 |

## 业务扩展接入的含义

ThoughtDAG 的图结构对应 thoughtdag 扩展域和 schema 2，由 Maintenance 的图领域实现与业务扩展 Adapter 维护；本插件没有实现另一套平台会话 Adapter。统一引用的权威关系仍在 Annotation 数据域，图是按主干组织的呈现与结构。

扩展通用读取、图领域写入和原生上下文分别有自己的能力门槛。协议不匹配时显示错误；保存图不能回落到 bridge 通用保存。配置指向同一实例，源码依赖存在不证明运行副本可用。

技术调用依据：[服务器分派](../../../../../../dsh/lib/managed-graph.js)、[iframe API](../../../../../../src/maintenance/client.ts)。平台真源、快照和 Engine 内部结构请按提供方地图查询，本页不复制。
