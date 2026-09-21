---
id: IF-maintenance-consumer
kind: interface
title: ThoughtDAG 与 Maintenance 的历史接入（已解除）
status: superseded
summary: ThoughtDAG 曾按能力消费 Maintenance 的图领域、扩展读取与创建服务；0.4.14-rc2.26 起插件本体不再依赖它，接入改由 adapter 承担。
superseded_by: DEC-sticker-independent-20260921
sources:
- path: ../../dsh/lib/managed-graph.js
- path: ../../src/maintenance/contracts.ts
- path: ../../src/maintenance/client.ts
relations:
- relation: supersedes
  to:
    record_id: DEC-sticker-independent-20260921
  reason: 插件本体已不消费 Maintenance；本页只保留历史定位，接入职责移交 adapter
---

# ThoughtDAG 与 Maintenance 的历史接入（已解除）

**本页已不是当前实现说明。** 0.4.14-rc2.26 起，ThoughtDAG 插件本体**不再调用任何 Maintenance 接口**：没有 `/maintenance-knowledge/*`，没有 `maintenanceGraph` / `maintenanceExtensionData` / `maintenanceNativeContext`，也没有指向 Maintenance 仓库的 `file:` 依赖。将来 Maintenance 的接入由 **adapter** 承担，插件本体只跟本地数据与宿主打交道。

当前边界见 [[DEC-sticker-independent-20260921]] 与 [[IF-integration]]；本页保留，用于解释旧调用点的来源与迁移范围。

## 曾经的调用点（现已移除）

| 插件能力 | 曾经的实际调用 | 移除后的替代 |
|---|---|---|
| 当前会话主干、保存/绑定/删除 | `maintenanceGraph` 的 ensure/load/save/bind/remove（协议 2） | 插件自己的 `/thoughtdag/api/managed/*`，经 Core 的 `sessionExtensionData` 落 `thoughtdag` 命名空间 |
| 会话选择、固定来源、引用/披露位置 | `maintenanceGraph` 的 directory/resolve/preview/relations/disclosures | 同上；`preview`/`directory` 走 Core 的 `sessionReferenceContext` |
| 图列表与已有对象 | `maintenanceExtensionData.bridge` 的 list，以及 annotation/obsidian-links 的 list/get | 同上（同一份 `objects` 表） |
| 贴纸对象、工作区、创建会话 | `maintenanceKnowledge.request(list/get stickers)`；`dispatch(create-workspaces/create-session)` | **会话贴纸不再有对象**：改为新建真实会话 + 一条单向拓扑边；工作区由宿主 `workspaces` 投影反查；创建会话走 `/thoughtdag/api/managed/create-session`、`create-sticker` |
| 来源上下文面板 | `maintenanceNativeContext.requestAsUser` | 宿主原生上下文入口本身不变，类型改为本地声明 |

## 为什么必须解除

贴纸面板挂载即请求 `POST /maintenance-knowledge/api/create-workspaces`。该路由由 Maintenance 提供，实例没装它时宿主返回 **405 + 0 字节**，而旧的 `knowledgeRequest` **先 `response.json()` 后判 `ok`**，于是抛出 `Failed to execute 'json' on 'Response': Unexpected end of JSON input`。测试夹具当时伪造了一个总是 200 的 maintenance 服务端，掩盖了这条路径——这也是本次故障长期未被发现的原因。

技术依据：[服务器分派](../../../../../../dsh/lib/managed-graph.js)、[本地合同声明](../../../../../../src/maintenance/contracts.ts)、[iframe API](../../../../../../src/maintenance/client.ts)。平台真源与 Engine 内部结构请按提供方地图查询，本页不复制。
