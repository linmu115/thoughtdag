---
id: MOD-graph-state
kind: module
title: 图模型、布局和刷新合并
status: current
summary: 维护客户端结构与局部编辑；权威归属、撤销和会话名来自服务器。
sources:
- path: ../../src/maintenance/model.ts
- path: ../../src/maintenance/sync.ts
- path: ../../src/maintenance/ManagedGraphApp.tsx
relations:
- relation: part_of
  to:
    record_id: MOD-canvas
- relation: implements
  to:
    record_id: REQ-storage
---

# 图模型、布局和刷新合并

model.ts 保存 managedSchema 2 的客户端结构与布局规则；sync.ts 把上次接受、本地编辑和最新服务器文档三者合并。它们是同一插件的状态子模块，不是另一个数据服务。

- 来源在上，接收在下；多父来源横向分布。新增节点安排位置，已有手动位置保留；仅“按来源排列”主动重排。
- 刷新以服务器成员关系和授权边为准，保留本地未保存的位置、缩放、新卡片、材料名称和新 pending 线。服务器删除的节点和已撤销引用不能因本地旧图复活。
- 会话卡片名称来自当前会话元数据；材料、占位卡与未绑定草稿可以自行命名。
- layoutDraft 将恢复副本设为未绑定，只保留不带 relationId 的 pending 线，不复制活动引用权限。
- 已测尺寸仅放在当前画布的内存缓存，拖动、保存和后台刷新复用；不会写入 Maintenance。该设计解决卡片反复隐藏与重测引起的闪烁。

对象意义见 [[OBJ-main]]。服务端迁移、图唯一性、源版本与撤销约束仍由提供方负责，不能仅根据本地 TypeScript 类型声称已经通过权威校验。
