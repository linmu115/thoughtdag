---
id: MOD-host-server
kind: module
title: 当前实例服务器桥接
status: current
summary: 提供同源 API 和静态应用，将请求转交当前实例的服务。
sources:
- path: ../../dsh/lib/managed-entry.js
- path: ../../dsh/lib/managed-graph.js
- path: ../../src/maintenance/client.ts
relations:
- relation: part_of
  to:
    record_id: MOD-managed
- relation: provides
  to:
    record_id: IF-host-bridge
---

# 当前实例服务器桥接

managed-entry.js 注册 /thoughtdag 下的应用资源和 API。managed-graph.js 处理受管请求；src/maintenance/client.ts 是 iframe 内的调用层。

桥接校验当前窗口来源、请求体大小和字段，输出有界结果及明确错误。native-context 操作有白名单，输入不得覆盖 actor、runId、profileId、instanceId、ownerSessionId、targetSessionId、executionId 等身份。

能力检查分别看图协议 2、扩展存储与原生上下文协议 1。缺服务或不兼容时禁用相应操作，图写入不退回通用扩展 save。图、目录、预览、已有对象与新建会话/会话贴纸全部走本插件自己的 `/thoughtdag/api/managed/*`（`ensure`/`load`/`save`/`bind`/`remove`/`directory`/`resolve`/`preview`/`relations`/`objects`/`object`/`create-session`/`create-sticker`/`native-context`），数据经 Core 的 `sessionExtensionData` 落 `thoughtdag` 命名空间。**不再有 maintenance 服务调用**：历史接入见 [[IF-maintenance-consumer]]，当前边界见 [[DEC-sticker-independent-20260921]]。

`create-sticker` 是会话贴纸的唯一入口：在当前工作区以确定性 sessionId 新建会话（幂等），并在**新会话自己的图**里写一条 `bound:<被选段会话>:<新会话>` 边；被选段会话的图不重复存这条边。绑定边不带 `relationId`，只表达拓扑。客户端另用 `current-workspace` 反查当前会话所属工作区，用户不再需要选工作区。

**待决（本轮未改）**：写入口包含 `sessionWriteAccess?.assertWritable()`，但 `managed-entry.js` 的 inject 列表里没有 `sessionWriteAccess`；未装 Maintenance 时行为正确，接入后其恢复期会被绕过。见 [[IMP-write-access-20260921]]。

本模块没有 Engine 凭证配置入口，不直接读写会话文件。外部数据源由各提供方自己的地图维护。
