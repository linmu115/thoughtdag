---
id: IF-integration
kind: interface
title: 画布与外部服务的协作入口
status: current
summary: 细分图存储、原生上下文、统一引用、对象导航和上游拓扑注入，完整合同留给各提供方。
sources:
- path: ../../dsh/lib/managed-graph.js
- path: ../../dsh/lib/client.js
- path: ../../dsh/lib/managed-entry.js
---

# 画布与外部服务的协作入口

ThoughtDAG 负责把卡片、连线和用户操作组织为当前会话的图。它通过 [[IF-host-bridge|本插件宿主桥接]]使用不同服务：

- **本插件自己的受管接口**（当前唯一的数据路径）：`/thoughtdag/api/managed/*` 提供图读写、目录、固定来源预览、已有对象、新建会话与会话贴纸；数据经 Core 的 `sessionExtensionData` 落 `thoughtdag` 命名空间。宿主 `workspaces` 投影用来反查当前会话的工作区。
- [[IF-suite-consumer|Annotation、贴纸与笔记接入说明]]：创建/准备/清理统一引用、打开已有对象。
- [[IF-upstream-notice|上游拓扑说明注入]]：把当前会话图声明的上游支流写进提示。它只说拓扑，不授权读取，也不替代引用。
- **Maintenance：插件本体不再接入。** 曾经的调用点见 [[IF-maintenance-consumer]]（已 superseded）；将来由 adapter 承担。

原有 IF-integration 身份继续作为协作总入口；原来集中于这里的消费声明移到对应接入说明。没有把提供方合为本项目内部模块。

**引用与绑定分开**：连线与会话贴纸只产生 ThoughtDAG 自己维护的拓扑边；读取仍然只能由 Core 的引用授权。两者的归属见 [[DEC-reference-vs-binding]]，贴纸的自持决定见 [[DEC-sticker-independent-20260921]]。

修改字段或行为前，核对提供方合同及本插件调用点；共享 DTO 的导入只说明类型依赖，不证明调用全部能力，也不证明当前实例已经安装启用。本插件已不再依赖任何 maintenance 包或指向维护仓库的 `file:` 依赖。
