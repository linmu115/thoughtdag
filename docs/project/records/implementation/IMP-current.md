---
id: IMP-current
kind: implementation
title: 当前受管图能做什么
status: current
summary: 唯一主干、真实会话卡片、固定引用、统一撤销、位置日志和原生上下文面板已有实现。
progress: implemented
gap: 真实模型与人工长时间并发、复杂旧图归属迁移仍需依具体发布验收；托管 Agent 的新增释放能力不在当前交付范围。
relations:
- relation: implements
  to:
    record_id: REQ-main
- relation: implements
  to:
    record_id: REQ-create
- relation: implements
  to:
    record_id: REQ-context-ui
sources:
- file: ../../dsh/MANAGED.md
- file: ../../dsh/README.md
---

# 当前受管图能做什么

当前 DSH 插件版本为 0.4.14-rc2.13（以 dsh/package.json 核验），当前源码包括：

- 标题栏切换会话/思维图，保留 iframe 与画布状态，适配 DSH 深浅主题和侧栏。
- 空卡片与按工作区分页选择会话，延迟创建，真实会话接续。
- 来源在上、接收在下的布局；手动位置保留，明确操作时才重新排列。
- 固定来源只读预览、披露位置与预算提示，撤销同步与归档只读。
- 来源上下文面板：请求目录、不连续窗口、暂停/恢复、释放、固定保留与待生效/失败反馈。
- 修订冲突保留布局，可另存无引用权限的恢复草稿。

本轮整理的是上述源码和已有交付资料，没有安装或运行新的用户会话。
