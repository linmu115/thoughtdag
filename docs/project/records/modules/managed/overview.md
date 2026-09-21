---
id: MOD-managed
kind: module
title: DSH 受管图：模块总览
status: current
summary: 插件由会话外壳、画布编辑、图状态、来源面板和两条宿主桥接组成。
sources:
- path: ../../src/App.tsx
- path: ../../src/maintenance/ManagedGraphApp.tsx
- path: ../../dsh/lib/managed-entry.js
relations:
- relation: implements
  to:
    record_id: REQ-main
---

# DSH 受管图：模块总览

DSH 构建以 VITE_DSH_BRIDGE 选择受管界面。dsh-thoughtdag 包提供静态 SPA、宿主服务器入口和客户端扩展；用户从真实会话标题栏切到图，模型请求仍由真实会话执行。

| 子模块 | 独立职责 | 主要入口 |
|---|---|---|
| [[MOD-host-shell|会话外壳与宿主客户端]] | 视图切换、当前会话通知、主题/可见性、进入会话与调用 Core | dsh/lib/client.js |
| [[MOD-canvas|画布编辑和对象操作]] | 会话选择、卡片/边菜单、上游拓扑绑定、保存与错误入口 | src/maintenance/ManagedGraphApp.tsx |
| [[MOD-graph-state|图模型与状态合并]] | 卡片类型、来源布局、修订刷新合并、无权限恢复草稿 | src/maintenance/model.ts、sync.ts |
| [[MOD-source-reading|来源阅读与上下文界面]] | 固定预览、披露日志、请求目录和三层上下文 | DisclosurePanel.tsx、SourceContextPanel.tsx |
| [[MOD-host-server|当前实例服务器桥接]] | 同源与输入校验，把操作转交当前实例的会话数据端口，并把上游拓扑注入提示 | dsh/lib/managed-entry.js、managed-graph.js |

## 边界为什么这样划分

这些子模块各有不同的状态、接口或失败恢复责任；model/sync 不拥有后端权限，宿主客户端也不代替服务器维护持久图。常规渲染函数没有继续拆成模块。

**连线只表达拓扑**：画布发布的 `bound` 边不创建引用、不授权读取；读取能力仍在 Core 的引用上，[[IF-upstream-notice|上游拓扑说明]]只负责让模型知道支流存在。归属见 [[DEC-reference-vs-binding]]。

源码目录中的独立应用、server.mjs 模型代理、Session Atlas 与 IndexedDB 会话状态不由当前受管入口加载。独立应用的能力不能直接算作 DSH 功能；从 DSH 删除全局入口也不等于删除独立应用。

接口导航见 [[IF-integration]]；当前行为与限制见 [[IMP-current]] 与 [[IMP-binding-20260921]]。
