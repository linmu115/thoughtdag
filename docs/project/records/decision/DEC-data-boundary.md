---
id: DEC-data-boundary
kind: decision
title: 为什么只维护轻量主干和明确引用
status: current
summary: 图负责结构和可解释状态；真实会话继续执行，来源正文保持各自真源。
sources:
- path: ../../../../worktrees/session-context-graph-20260913/dsh-session-maintenance/docs/superpowers/specs/2026-09-10-session-context-graph-requirements.md
- provider: codex
  thread_id: 01a08a9d-25fc-7ae0-ab58-205cf1448e10
  message_id: msg_01a0a084-f80d-74e2-bc7a-cfbfec079c7d
  line: 8872
- provider: codex
  thread_id: 01a08a9d-25fc-7ae0-ab58-205cf1448e10
  message_id: msg_01a0a384-e2b6-7211-9fbc-2e6a8ae784a2
  line: 14149
relations:
- relation: derived_from
  to:
    record_id: REQ-main
- relation: derived_from
  to:
    record_id: REQ-storage
- relation: derived_from
  to:
    record_id: REQ-context-ui
---

# 为什么只维护轻量主干和明确引用

## 已确认的选择

2026-09-14 用户澄清：从 X 选段形成 Y 并在 Y 回答，生成的图归 Y；各会话只维护自己的主干，支流关系出现在接收方图中。卡片/连线的意义是上下文传导，提问回真实会话；全局维护网络、影响查看、准备重答入口已取消。

图保留结构、固定截止和披露位置，服务端在前端未打开时也能记录。正文按需回真源读取，避免把图变成第二套会话存储，也避免每次读取都重存整图和引发布局修订冲突。

2026-09-15 用户确认三个不同动作：释放材料、暂停连接、解除连接；也确认不连续窗口、请求目录和用户固定保留。托管引擎的额外释放适配当时明确先不处理。

## 设计带来的边界

- 多来源合流由多条独立引用表达，不重写原生会话的父子版本或原始问答。
- 添加卡片与确认权限分开；源版本不可用不能悄悄改读最新。
- 删除图中关系不追溯擦除历史回答，也不批量删除真实会话或笔记。
- UI 只报告服务返回的生效状态；合成界面通过不能证明原生模型输入已释放。

原始用户消息身份和摘要校验值见 source-review-2026-09-16.json；后续结构化要求仍绑定原规格。退役范围见 [[DEC-retired-global]]，未确认建议见 [[DEC-pending-simplification]]。
