---
id: OBJ-main
kind: object
title: 图、卡片、引用边各代表什么
status: current
summary: 主干属于接收会话；布局、卡片和拓扑绑定都不自动获得上下文权限。
sources:
- path: ../../src/maintenance/model.ts
- path: ../../dsh/README.md
- path: ../../../../worktrees/session-context-graph-20260913/dsh-session-maintenance/docs/superpowers/specs/2026-09-10-session-context-graph-requirements.md
---

# 图、卡片、引用边各代表什么

以 X → Y 为例：Y 是接收材料并执行的会话，图属于 Y；X 是固定版本的上游来源。作为支流的关系显示在 Y 的图里，不会自动扩展 X 的图。

## 连线现在有两种含义，必须分开读

2026-09-21 起，用户在画布上把两张卡片连起来只产生**上游拓扑绑定**：它说明「谁在上游」，不说明读过任何内容，也不携带锚点或读取范围。读取仍然只能由 Core 的引用授权。两种边的身份和呈现不同：

| 边 | 身份 | 是否授权读取 | 呈现 |
|---|---|---|---|
| 上游绑定 | `bound:<source>:<target>`，`data.kind = 'bound'`，无 `relationId` | 否。绑定本身不读、不注入任何上游正文 | 非 muted、虚线，标签「上游绑定」 |
| 固定引用边 | 带 `relationId`、`namespace = annotation-upstream`、版本与完成截止 | 是。读取范围固定在引用发送时选定的位置 | 按引用状态显示投递/草稿/撤销 |
| pending 连接 | 只有待绑定意图，缺真实会话身份 | 否 | muted、虚线，「待绑定连接」 |
| 旧知识线 | legacyEdges 留存核查 | 否，不能直接变成授权引用 | 旧关联 · 未授权 |

## 对象身份与生命周期

| 对象 | 身份和归属 | 生命周期 |
|---|---|---|
| 已绑定主干 | objectId 对应图对象；ownerSessionId 是接收方逻辑会话 | 同会话复用；归档只读；恢复不恢复已撤销引用 |
| 未绑定草稿 | ownerSessionId 为空 | 首次确定执行会话时绑定；已有主干则复用并保留未合并草稿 |
| 会话卡片 | 图内 nodeId 引用逻辑会话 ID | 名称随会话更新；删卡片保留真实会话和既有回答 |
| 占位空卡片 | 尚无真实会话身份，可保存创建操作/工作区意图 | 明确开始后才创建并绑定；取消不创建 |
| 材料/贴纸/笔记卡片 | 各有 kind、必要短摘录或外部对象定位 | 是阅读/导航材料；存在卡片不自动建立授权 |
| 披露日志 | 按引用/执行记录位置、计数、交付结果 | 单独分页更新；裁剪有标记，不保存完整历史正文 |

布局位置、缩放、卡片尺寸和材料标题与读取权限无关。删除绑定只删拓扑，不追溯擦除任何历史回答。

图只呈现 [[OBJ-context-state|授权、窗口、保留及历史覆盖]] 的状态；真源会话正文和权限验证由外部提供方负责。绑定的归属决定见 [[DEC-reference-vs-binding]]，需求与验收边界见 [[REQ-upstream-binding]]。
