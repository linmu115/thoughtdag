---
id: OBJ-context-state
kind: object
title: 授权上限、活动窗口、保留材料与历史覆盖
status: current
summary: 四个维度分别回答能读、想读、仍保留、曾返回，避免把界面动作当作实际释放。
sources:
- path: ../../../../worktrees/session-context-graph-20260913/dsh-session-maintenance/docs/superpowers/specs/2026-09-15-native-agent-context-management.md
- path: ../../src/maintenance/SourceContextPanel.tsx
relations:
- relation: derived_from
  to:
    record_id: REQ-context-ui
---

# 授权上限、活动窗口、保留材料与历史覆盖

| 维度 | 示例 | 哪种操作影响它 |
|---|---|---|
| 固定授权上限 | X 的固定版本截至第 40 轮 | 新建引用时确认；扩大窗口不能改为第 100 轮 |
| 当前披露窗口 | 当前需要第 20–40 轮，或几个不连续范围 | 在既有授权内调整；扩大不自动加载全文 |
| 当前保留材料 | 模型输入仍保留第 38、40 轮 | 固定、释放及原生执行边界回执；不是删除气泡就完成 |
| 历史读取覆盖 | 过去哪些位置返回、截断、继续游标 | 由披露回执累积；释放不会抹去已读事实 |

释放材料保留图边，后续仍可重新读；暂停连接停止后续取用，不默认同时释放；解除连接撤销对应引用。用户固定的材料应先取消固定，再释放。

用户请求目录帮助找到来源会话在做什么，属于定位结构；目录展开和问答预览不算模型已读。图中出现一条边也不证明模型读过完整来源。

本页解释 UI 概念，完整状态字段和执行合同由 Maintenance 的 IF-native-context 维护，入口见 [[IF-maintenance-consumer]]。
