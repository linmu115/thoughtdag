---
{
  "id": "IMP-independent-components-20260920",
  "kind": "implementation",
  "title": "ThoughtDAG 独立组件升级候选",
  "status": "current",
  "summary": "图合法性与增删仍由 DAG 执行，持久化通过会话数据端口；单向依赖 Core；移除旧受管服务优先路径，Maintenance 仅通过会话数据 adapter 接入。 候选未安装。",
  "sources": [
    {
      "path": "../changes/2026-09-20-independent-components.md"
    },
    {
      "path": "../../dsh/lib/session-graph.js"
    }
  ]
}
---

# ThoughtDAG 独立组件升级候选

图合法性与增删仍由 DAG 执行，持久化通过会话数据端口；单向依赖 Core；移除旧受管服务优先路径，Maintenance 仅通过会话数据 adapter 接入。

本记录说明本轮源码状态；历史部署/验证不自动成为本轮证据。[[IMP-independent-components-20260920]] 的实现细节和限制见绑定变更文档，最终验证见交付报告。


## DAG 依赖边界修复（本轮后续）

本轮纠正：DAG 无条件使用 Core 公共会话数据/引用端口，删除旧 Maintenance 优先选择。主干能力必须通过实际读取检查；图合法性和增删仍由 DAG 负责。10 项针对性测试通过，实际 WebUI 待修复 Maintenance .35 注册识别后验证。
