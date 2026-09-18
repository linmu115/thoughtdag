---
id: OBJ-main
kind: object
title: 图、卡片、引用边各代表什么
status: current
summary: 主干属于接收会话；布局与卡片不自动获得上下文权限。
sources:
- path: ../../src/maintenance/model.ts
- path: ../../dsh/MANAGED.md
- path: ../../../../worktrees/session-context-graph-20260913/dsh-session-maintenance/docs/superpowers/specs/2026-09-10-session-context-graph-requirements.md
---

# 图、卡片、引用边各代表什么

以 X → Y 为例：Y 是接收材料并执行的会话，图属于 Y；X 是固定版本的上游来源。作为支流的关系显示在 Y 的图里，不会自动扩展 X 的图。

| 对象 | 身份和归属 | 生命周期 |
|---|---|---|
| 已绑定主干 | objectId 对应图对象；ownerSessionId 是接收方逻辑会话 | 同会话复用；归档只读；恢复不恢复已撤销引用 |
| 未绑定草稿 | ownerSessionId 为空 | 首次确定执行会话时绑定；已有主干则复用并保留未合并草稿 |
| 会话卡片 | 图内 nodeId 引用 logicalSessionId | 名称随会话更新；删卡片保留真实会话和既有回答 |
| 占位空卡片 | 尚无真实会话身份，可保存创建操作/工作区意图 | 明确开始后才创建并绑定；取消不创建 |
| 材料/贴纸/笔记卡片 | 各有 kind、必要短摘录或外部对象定位 | 是阅读/导航材料；存在卡片不自动建立授权 |
| pending 连接 | 仅表达待绑定意图 | 来源与接收条件具备并确认后才能成为固定引用 |
| 固定引用边 | relationId 对应统一引用，携带版本与完成截止 | 可准备/发送/撤销；移除后不能由刷新复活 |
| 披露日志 | 按引用/执行记录位置、计数、交付结果 | 单独分页更新；裁剪有标记，不保存完整历史正文 |

旧知识线作为 legacyEdges 留存核查，不能直接变成授权引用。布局位置、缩放、卡片尺寸和材料标题与读取权限无关。

图只呈现 [[OBJ-context-state|授权、窗口、保留及历史覆盖]] 的状态；真源会话正文和权限验证由外部提供方负责。
