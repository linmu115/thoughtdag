---
id: IMP-write-access-20260921
kind: implementation
title: 待决：sessionWriteAccess 未进入注入列表
status: current
summary: managed-graph 的写入口会调用 sessionWriteAccess.assertWritable()，但 managed-entry 的 inject 列表里没有它；未装 Maintenance 时正确，接入后恢复期会被绕过。
progress: pending
gap: 尚未决定是否对齐宿主官方消费者的「曾见到该服务、断开即拒写」写法。
sources:
- workspace_id: source
  path: dsh/lib/managed-graph.js
  symbol: createManagedGraph
- workspace_id: source
  path: dsh/lib/managed-entry.js
  symbol: inject
---

# 待决：sessionWriteAccess 未进入注入列表

**超出 0.4.14-rc2.26 会话贴纸解耦的范围，本轮只登记、未改实现。**

`dsh/lib/managed-graph.js` 的写入口包含 `await service(ctx,'sessionWriteAccess')?.assertWritable()`，而 `dsh/lib/managed-entry.js` 的 `inject` 列表里**没有** `sessionWriteAccess`（该服务由 Maintenance 提供）。

## 当前为什么正确

未装 Maintenance 的实例上，`ctx.get('sessionWriteAccess')` 返回 undefined，可选链直接跳过 —— 写入不受影响，这正是当前部署的形态。

## 将来的风险

adapter 接入 Maintenance 后，若 Maintenance 正处于恢复期（`assertWritable` 会挂起或拒绝），这个可选项仍然不会生效：因为 `inject` 列表里没有它，插件不会等待该服务就绪，也不会在它断开时拒绝写入。

宿主官方消费者的写法是「记住曾见到该服务；若它断开则拒绝写入」（见 annotation-core 的 `assertSessionWritable`），本插件尚未对齐。

## 待决内容

1. 是否把 `sessionWriteAccess` 加进 `inject`（会让插件等待该服务，改变加载时序）。
2. 是否采用官方消费者的「曾见到 + 断开即拒写」语义。
3. 该决定属于 adapter 接入工作，还是本插件的独立改动。

**不要在没有对应 adapter 接入决策的情况下顺手改实现。**
