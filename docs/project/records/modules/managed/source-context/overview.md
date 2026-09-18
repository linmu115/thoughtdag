---
id: MOD-source-reading
kind: module
title: 来源阅读与上下文界面
status: current
summary: 三个阅读入口分别显示固定问答、披露历史、当前上下文状态。
sources:
- path: ../../src/maintenance/ManagedGraphApp.tsx
- path: ../../src/maintenance/DisclosurePanel.tsx
- path: ../../src/maintenance/SourceContextPanel.tsx
- path: ../changes/2026-09-15-native-context-ui.md
relations:
- relation: part_of
  to:
    record_id: MOD-managed
- relation: implements
  to:
    record_id: REQ-disclosure
- relation: implements
  to:
    record_id: REQ-context-ui
---

# 来源阅读与上下文界面

| 入口 | 解释的问题 | 边界 |
|---|---|---|
| 卡片“查看来源” | 这次引用允许读哪个固定版本、哪条问答？ | 只读分页；选文可制作材料、引用到会话或打开会话贴纸 |
| DisclosurePanel | 哪些位置曾返回、是否截断、从哪里继续？ | prepared/returned/failed 分开；历史覆盖与用户预览不混淆 |
| SourceContextPanel | 当前授权、窗口、保留与释放是否生效？ | 通过 Maintenance 原生上下文服务操作；不在 UI 模拟释放 |

## 原生上下文面板中的层次

请求目录只在展开后分页加载，长请求可继续读，问答预览独立展开；收起会取消未完成请求。选择稳定请求位置组成可不连续的窗口，未提交计划不被后台状态刷新覆盖。

用户可以提交窗口调整、暂停/恢复、固定/取消固定和释放。暂停不会隐含释放；默认按 referenceId 放弃该引用的材料持有，共享正文按 materialIds 释放时明确其他受影响引用。实际生效、等待下一次原生模型请求、失败与不支持分别显示。

浏览别人的主干时必须先进入对应会话，再改该主干的上下文；网络或 5xx 造成结果不确定时保留操作身份，先核对再重试。模型自身的工具能力由原生宿主及服务提供，本模块只呈现/提交用户操作。

[[OBJ-context-state|三层状态]]、[[MOD-context|既有实现维护入口]]与[[IF-maintenance-consumer|消费接口]]互相补充。测试范围另见 [[VER-ui]]。
