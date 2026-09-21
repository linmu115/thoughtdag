---
id: ARCH-connect-reads-upstream
kind: decision
title: 旧读法：连线确认固定来源并固定读取上限
status: current
summary: 说明已归档；当前说明见 DEC-reference-vs-binding
documentation:
  state: archived
  reason: 旧说明把「拖线或右键连接两个节点」当作建立经确认的固定上游关系：先确定来源与接收方，再选择或确认来源的已完成回复并固定上限，连线因此创建 Core 引用并约束读取范围。用户在 2026-09-21 明确划定引用归 Core、绑定归 DAG，连线只做单纯拓扑绑定，该读法已被替代。
  evidence: 对照用户 2026-09-21 原话（引用是引用，绑定是绑定 / 先不要这个锚点，单纯拓扑绑定 / 以末尾的会话为起点）、src/maintenance/model.ts 的 bindUpstream、提交 595730c，以及 dsh/README.md 当前已知问题一节
  archived_at: '2026-09-21T00:00:00+00:00'
  archive_path: archive/records/7c1a90e2b3fd-connect-reads-upstream.md
  sha256: 9d783b6f925c4d58b1d7cc5dc85fc2c41229ce62ac6bc69e9ca2dc7a8285791e
  original_path: records/modules/managed/canvas/overview.md（旧读法正文另存于 archive/records/2f9b1c7a44d1-mod-canvas-connection-as-reference.md，指纹 5c124f1b30c9c89dc0a53cf5f811e94cae9ac388f0ffe9f534585b15aee8d32e）
  original_path: records/modules/managed/canvas/overview.md
  original_line: 1
  original_end_line: 41
  original_source:
    path: ../../../../worktrees/session-context-graph-20260913/dsh-session-maintenance/docs/superpowers/specs/2026-09-10-session-context-graph-requirements.md
    note: 该旧读法的规格来源段落为 AC33「拖线或右键连接两个节点 → 建立经确认的固定上游关系」与 5.3 的连接段落（原文仍在提供方仓库，不由本地图改动）
  map_version:
    git_head: 547f9f76f6f1aba9e74c94cbc6f7e60659edaa0a
    branch: codex/independent-plugins-20260920
    dirty: true
  successor: DEC-reference-vs-binding
  current_gap: false
aliases:
- 连线确认固定来源（旧）
relations:
- relation: derived_from
  to:
    record_id: REQ-main
---

这份说明已归档，不代表相关功能退役或需求撤销。

原因：旧说明把「拖线或右键连接两个节点」当作建立经确认的固定上游关系：先确定来源与接收方，再选择或确认来源的已完成回复并固定上限，连线因此创建 Core 引用并约束读取范围。用户在 2026-09-21 明确划定引用归 Core、绑定归 DAG，连线只做单纯拓扑绑定，该读法已被替代。

当前说明：[[DEC-reference-vs-binding]]。

需要旧正文时显式查看历史；默认查询只返回本提示和替代定位。
