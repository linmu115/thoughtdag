---
id: MOD-host-shell
kind: module
title: 会话外壳与宿主客户端
status: current
summary: 把思维图嵌入真实会话；桥接导航、引用操作和当前会话/可见性通知。
sources:
- path: ../../dsh/lib/client.js
- path: ../../src/maintenance/theme.ts
- path: ../../src/maintenance/shell.css
relations:
- relation: part_of
  to:
    record_id: MOD-managed
- relation: provides
  to:
    record_id: IF-host-bridge
- relation: implements
  to:
    record_id: REQ-presentation
---

# 会话外壳与宿主客户端

用户看到固定位置的“对话 / 思维图”开关。插件复用当前会话中的 iframe，切回对话后隐藏画布并停止可见刷新；连续切换从当前过渡状态接续。开关的选中底块、画布外壳动效和系统减少动画分别处理。

宿主客户端取得当前原生会话，向 iframe 发送会话与图变化通知。引用变更、会话列表变动、窗口恢复、面板重新显示都会触发核对。主题来自 DSH，插件的字体、颜色和边界与宿主对齐。

## 两类工作分开

- **界面生命周期**：挂载、切换、对齐、焦点、可见性和卸载清理。
- **业务意图**：校验 iframe 请求，再调用原生会话、Annotation Core 或贴纸/笔记导航。每次打开会话先重新解析目标身份；存在合法入向引用时由 Core 准备，成功后才进入会话。

本模块不发送用户正文，也不管理图的持久修订。对外调用范围见 [[IF-suite-consumer]]；自己提供给 iframe 的约定见 [[IF-host-bridge]]。
