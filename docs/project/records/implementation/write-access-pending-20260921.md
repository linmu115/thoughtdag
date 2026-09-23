---
id: IMP-write-access-20260921
kind: implementation
title: 可选写入许可服务的断开与恢复
status: current
summary: 从未提供时支持独立运行；曾观察到服务后，断开则拒写，恢复后通过许可校验再允许。
progress: implemented
gap: 合成测试通过，尚未安装或完成实机动态重载验收。
sources:
- workspace_id: source
  path: dsh/lib/managed-graph.js
  symbol: createManagedGraph
---

# 可选写入许可服务的断开与恢复

2026-09-23 主任务明确授权将动态依赖修复纳入本轮，取代此前暂不修复的阶段决定。公共 `sessionWriteAccess` 仍是可选服务，不增加具体 Maintenance 依赖，也不加入插件顶层必需注入列表。

`createManagedGraph` 通过动态注入记住服务曾经出现；从未出现时允许独立写入。一旦出现过，断开期间拒绝 POST 写入，但 GET 阅读保持可用。重新注册并允许写入后恢复；异步许可检查跨越提供者切换时拒绝旧请求，要求重试。具体修复与验证分别见 [[IMP-client-lifetime-20260923]]、[[VER-client-lifetime-20260923]]。

## 历史决定

2026-09-21 的会话贴纸解耦范围没有修复此项，用户当时明确「先不修，等以后需要自动回归时再补」。原记录指出可选链会在服务消失后跳过许可；该阶段只登记待决，不因 rc2.26 发布而声称完成。2026-09-23 的新授权与当前实现替代这一待决状态，保留本条记录 ID 供历史链接使用。
