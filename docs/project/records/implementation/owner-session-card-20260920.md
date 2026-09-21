---
{
  "id": "IMP-owner-session-card-20260920",
  "kind": "implementation",
  "title": "独立会话图补齐所属卡片",
  "status": "current",
  "summary": ".18 修复初始空图缺少所属会话卡片；测试实例已安装并验证刷新保持，标题仍回退为会话 ID。"
}
---

# 独立会话图补齐所属卡片

ensure 原来只写 ownerSessionId 和空 nodes。现在首次创建即加入所属会话节点，并在原对象上修复修订 1、未归档且无节点和边的旧初始图。已编辑图保持不变，后续主动移除不会被每次重开恢复。持久化仍走 Core 会话数据端口。

测试：20 项相关测试、类型检查及生产构建通过。通过官方插件命令安装 dsh-thoughtdag 0.4.14-rc2.18，其他组件版本未回退。Maintenance 关闭时，实际测试会话显示 1 张卡片、0 条连接、修订 2；整页刷新再打开保持相同结果。

限制：当前宿主未返回会话名称，图和卡片以会话 ID 显示。标题读取/跟随重命名、其他图业务、Maintenance 同步不属于本次通过项。

源码：dsh/lib/session-graph.js；回归：dsh/tests/session-graph.test.mjs；变更说明：docs/changes/2026-09-20-owner-session-card.md。部署证据位于插件项目根 artifacts/architecture-upgrade-20260920/dag-owner-session-card-20260920.md。


后续 .19：已用 rc.2 正式 readTitle/readTitleSnapshots 修复名称读取。图和会话节点在读取时显示当前标题，不增加修订、不改变图布局；实际测试会话已显示名称，后端核对仍为修订 2。此前名称缺口属于 .18 历史状态。完整 59 项串行测试、类型检查和构建通过。发布与新标签冷启动验证限制见 dsh/docs/RELEASE-20260920.md。
