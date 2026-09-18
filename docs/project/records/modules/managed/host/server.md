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

能力检查分别看图协议 2、扩展存储与原生上下文协议 1。缺服务或不兼容时禁用相应操作，图写入不退回通用扩展 save。目录、图操作、上下文和贴纸对象阅读调用不同服务，详见 [[IF-maintenance-consumer]]。

本模块没有 Engine 凭证配置入口，不直接读写会话文件。平台 Adapter 怎样取得真源和版本，是 Maintenance 提供方自己的职责。
