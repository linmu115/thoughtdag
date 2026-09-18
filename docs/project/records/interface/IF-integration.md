---
id: IF-integration
kind: interface
title: 画布与外部服务的协作入口
status: current
summary: 细分图存储、原生上下文、统一引用和对象导航，完整合同留给各提供方。
sources:
- path: ../../dsh/MANAGED.md
- path: ../../dsh/lib/managed-graph.js
- path: ../../dsh/lib/client.js
---

# 画布与外部服务的协作入口

ThoughtDAG 负责把卡片、连线和用户操作组织为当前会话的图。它通过 [[IF-host-bridge|本插件宿主桥接]]使用不同服务：

- [[IF-maintenance-consumer|Maintenance 接入说明]]：唯一主干、图领域写入、固定版本/读取位置、原生上下文、有限对象目录与工作区创建。
- [[IF-suite-consumer|Annotation、贴纸与笔记接入说明]]：创建/准备/清理统一引用、打开会话贴纸和已有对象。

原有 IF-integration 身份继续作为协作总入口；原来集中于这里的消费声明移到对应接入说明。没有把两个提供方合为本项目内部模块。

修改字段或行为前，核对提供方合同及本插件调用点；共享 DTO 包的导入只说明类型依赖，不证明调用全部能力，也不证明当前实例已经安装启用。
