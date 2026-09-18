---
id: DEC-retired-global
kind: decision
title: 已移除的全局网络与局部问答区
status: retired
summary: DSH 全局网络、影响查看和准备重答已移除，不能回填为待做功能。
sources:
- provider: codex
  thread_id: 01a08a9d-25fc-7ae0-ab58-205cf1448e10
  message_id: msg_01a0a084-f80d-74e2-bc7a-cfbfec079c7d
  line: 8872
- file: ../../../../worktrees/session-context-graph-20260913/dsh-session-maintenance/docs/superpowers/specs/2026-09-14-session-graph-feature-scope-audit.md
- file: ../../dsh/MANAGED.md
---

# 已移除的全局网络与局部问答区

用户确认移除全局维护网络、全局影响查看和准备重答专属入口；局部问答常驻区改为按需来源预览，提问回到真实会话。

主干、按域对象管理、引用权限和独立应用保留。旧对象不因入口消失批量删除；旧混合画布待归属，旧知识线保留为 legacyEdges，不自动变成授权引用。

这是已实现过又被移除/调整的产品范围，不是失败探索。不要把这些条目加入“缺什么”的实施待办。
