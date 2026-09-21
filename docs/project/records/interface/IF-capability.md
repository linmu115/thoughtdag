---
id: IF-capability
kind: interface
title: 依赖的能力与边界（说明已归档）
status: current
summary: 说明已归档；当前说明见 IF-integration 与 IF-host-bridge
documentation:
  state: archived
  reason: 该绑定指向 dsh/MANAGED.md 的「能力与边界」，而 MANAGED.md 已被重写为单标题文档，原章节不复存在；其内容把图写入描述为经 Maintenance 的 maintenanceGraph 协议 2，而当前独立架构下 DAG 经 Core 会话数据端口工作，能力门槛也已改为图协议 2 与原生上下文协议 1。
  evidence: 对照 dsh/MANAGED.md 当前标题、dsh/lib/session-graph.js 的 createSessionGraph 与 protocolVersion、dsh/lib/managed-entry.js 的 inject 列表，以及 project_map.py validate 在修订前报出的失效标题
  archived_at: '2026-09-21T00:00:00+00:00'
  archive_path: archive/records/b58f2d10e7aa-capability-boundary-old-binding.md
  sha256: 5f2b7fd91ef32df3825c1eb885727c4fec3046bdaa33c65aadf9e3dffd363954
  original_path: dsh/MANAGED.md
  original_line: 1
  original_end_line: 1
  map_version:
    git_head: 547f9f76f6f1aba9e74c94cbc6f7e60659edaa0a
    branch: codex/independent-plugins-20260920
    dirty: true
  successor: IF-integration
  current_gap: false
aliases:
- 依赖的能力与边界（旧）
---

这份说明已归档，不代表相关功能退役或需求撤销。

原因：该绑定指向 dsh/MANAGED.md 的「能力与边界」，而 MANAGED.md 已被重写为单标题文档，原章节不复存在；其内容把图写入描述为经 Maintenance 的 maintenanceGraph 协议 2，而当前独立架构下 DAG 经 Core 会话数据端口工作，能力门槛也已改为图协议 2 与原生上下文协议 1。

当前说明：[[IF-integration]]。

需要旧正文时显式查看历史；默认查询只返回本提示和替代定位。
