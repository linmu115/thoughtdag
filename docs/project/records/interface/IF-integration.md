---
id: IF-integration
kind: interface
title: 画布怎样调用两个权威服务
status: current
summary: 图操作交给 Maintenance；引用创建和准备交给 Core，两边共享同一目标会话。
relations:
- relation: consumes
  to:
    record_id: IF-graph
    project_id: 0d05f813-7097-47d9-9e88-3d523bb537d6
- relation: consumes
  to:
    record_id: IF-native-context
    project_id: 0d05f813-7097-47d9-9e88-3d523bb537d6
- relation: consumes
  to:
    record_id: IF-reference
    project_id: dd46311f-d98d-49ff-ae13-fef0a8a6f9c3
sources:
- file: ../../dsh/MANAGED.md
- file: ../changes/2026-09-15-native-context-ui.md
---

# 画布怎样调用两个权威服务

用户拖出 X → Y 后，画布交付来源、接收方与完成位置。Maintenance/Adapter 解析固定版本、检查归属及修订；Core 创建或准备统一引用。进入 Y 时保留原草稿和附件，用户自行发送。

客户端不接受随意覆盖 owner、run、instance 等身份。写入必须匹配图协议及引用能力；旧组合明确禁用，不能走通用保存旁路。源版本不可用时明确失败，不改成读取最新版本。

删除调用同一后端命令，撤销后自动核对权威图；撤销成功但草稿清理失败要提供重试，不把局部 UI 成功当作全链路完成。
