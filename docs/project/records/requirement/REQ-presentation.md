---
id: REQ-presentation
kind: requirement
title: 会话名、上下布局和连续视图切换
status: current
summary: 让图跟随真实会话与宿主环境，拖动、刷新和切换时保持稳定。
progress: implemented
sources:
- path: ../../AGENTS.md
- path: ../../dsh/README.md
- path: ../changes/2026-09-15-current-session-names.md
- path: ../changes/2026-09-15-sliding-view-selector.md
- provider: codex
  thread_id: 01a08a9d-25fc-7ae0-ab58-205cf1448e10
  message_id: 01a0a527-5128-7922-9bda-b616cea5479a
- provider: codex
  thread_id: 01a08a9d-25fc-7ae0-ab58-205cf1448e10
  message_id: 01a0a513-49a0-7b83-ab80-417fd3b8ef05
- provider: codex
  thread_id: 01a08a9d-25fc-7ae0-ab58-205cf1448e10
  message_id: 01a0a4b4-f03d-7c01-8e0d-f33676db0843
---

# 会话名、上下布局和连续视图切换

## 当前要求

已绑定主干、会话卡片和左侧图列表显示对应会话名，旧图无需删除重建；会话页重命名后跟随更新。材料卡、空卡片和未绑定草稿继续允许自定义名称。

来源在上、接收在下，同链竖向对齐，多父来源横向分布；手动位置保留，明确操作时再重排。拖动、后台刷新和保存不能反复隐藏卡片造成闪烁。

对话/思维图切换沿用 DSH 边界与主题。文字和外框固定，选中底块连续滑动，快速反向点击从当前位置折返，遵循减少动画设置。

## 验收界线

名称更新不改变固定来源、读取截止、位置或关系身份；渲染测量不进入持久图。界面过渡应维持边界和按钮位置，切回对话复用 iframe，空闲时不新增持续动画循环。

这些要求分别有源码与历史合成/副本证据，见 [[VER-product-evidence]]。当前未测量用户 Obsidian 窗口的真实长时帧率。
