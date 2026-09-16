---
id: MOD-managed
kind: module
title: DSH 受管图入口与独立应用
status: current
summary: DSH 加载 ManagedGraphApp，独立应用仍走自己的入口。
sources:
- file: ../../../../worktrees/session-context-graph-20260913/dsh-session-maintenance/docs/superpowers/specs/2026-09-14-session-graph-feature-scope-audit.md
- file: ../../dsh/MANAGED.md
---

# DSH 受管图入口与独立应用

DSH 构建通过 VITE_DSH_BRIDGE 选择受管界面。ManagedGraphApp 组织当前主干、菜单、选择、刷新与布局；client.ts 与 dsh/lib/managed-graph.js 把意图交给同源宿主，后端固定操作身份。

上游独立应用的模型代理、SessionAtlas 等并非当前 DSH 图的产品能力。不能因为源码里还存在它们就说 DSH 集成支持，也不能因为从 DSH 删除全局入口就清理整个独立应用。

用户从图回到真实 DSH 会话发送问题。受管图不另建模型执行器，不复制完整对话到 IndexedDB。
