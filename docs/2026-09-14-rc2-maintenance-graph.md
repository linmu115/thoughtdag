# ThoughtDAG 本地适配与实现记录

日期：2026-09-14。任务：将 ThoughtDAG 最新上游基线克隆到本地，主动适配 DSH 0.1.5-rc.2，并按照已有会话上下文关系图规格实现 P3；只提交本地 Git。

## 基线与仓库

- 本地：`D:\AI\DeepSeekHarness-Plugin\repositories\thoughtdag`
- 分支：`codex/rc2-maintenance-graph`
- origin：`https://github.com/linmu115/thoughtdag.git`
- upstream：`https://github.com/chenxiachan/thoughtdag.git`
- 上游基线：`ef04210f6106a0dbc30f353cf67b25bee47d769c`
- 插件版本：`0.4.14-rc2.1`

此前兼容性核查只能确认到 rc1。此分支改造 DSH 入口并完成实际官方 rc2 Host 验证，未将原有宽泛版本说明当成适配证据。

## 具体修改

| 范围 | 修改与结果 |
|---|---|
| DSH Host | 用当前实例的 `maintenanceGraph` 和扩展 bridge 替代历史目录扫描、全量上下文编译和直接模型代理 |
| DSH Client | 保留原生标题栏入口；同源、指定 iframe 的请求才可打开会话、加入/解除引用、打开已有对象；停用时释放监听和 DOM |
| 图谱界面 | 多画布、修订保存、冲突提示、移除/恢复、工作区会话选择、真实会话主入口、固定版本局部预览、材料卡和三类边 |
| 上下文 | 显式目标、固定版本预期、Annotation 持久引用；目标正文/附件保留，不自动发送或重复建立原生历史 |
| 扩展归属 | 布局和呈现归 ThoughtDAG；引用归 Annotation；既有笔记对象归其数据域；不新建全文备份 |
| 启动 | DSH 构建只启动 managed 模式；独立应用入口单独加载，避免原 store 的 IndexedDB、镜像和自动备份副作用 |
| 生命周期 | 只移除呈现不会删除关系，解除关系由 Core 执行；缺少能力时保留画布，显示具体状态 |

实现说明与运行依赖见 [DSH 接入说明](../dsh/MANAGED.md)。既有总规格仍位于 Session Maintenance 的 `docs/superpowers/specs/2026-09-10-session-context-graph-requirements.md` 和 `2026-09-10-session-context-graph-plugin-changes.md`。

必要依赖也已作本地提交：Maintenance `5f83ad6`、`1098d6b`；Annotation Core `5d121c5`、`0284143`。分别增加当前实例图接口/严格 schema/显式空白会话登记，以及图谱引用操作/原子来源版本核对，复用已有可靠提交和预算实现。

## 验证与证据

所有交互均为合成数据；没有操作真实副本会话或发送模型请求。

- ThoughtDAG Host/界面聚焦测试：36 项通过，覆盖 HTTP 作用域、请求来源、错误与字节限额、CAS、重复创建、冷恢复、分页、固定来源、父窗口 RPC、关系与布局。DSH 构建、独立应用构建与改动 TypeScript 文件的 ESLint 检查通过。
- 官方 DSH 0.1.5-rc.2 Host：插件实际 Active，客户端 manifest 注入、画布资源可访问，目录/预览/保存/冲突正确，官方控制器创建合成会话并验证重复操作。
- 浏览器：实际构建 SPA 与实际父窗口 shim；创建和重命名、工作区选择、来源问答、固定材料翻页、加入目标引用、保存冲突、回收列表和恢复。
- Annotation Core：32 文件共 152 项测试及正式构建通过，保留已有初始问答和上游预算回归。
- Maintenance：原 9 文件 38 项相关测试、后续 11 项聚焦验证、全 workspace 类型检查及正式构建通过；两批有重叠，不将它们相加报告为独立测试数量。

测试产物位于 `D:\AI\DeepSeekHarness-Plugin\artifacts\thoughtdag-rc2-20260914`，含 `host-probe/result.json`、`browser/result.json`、`browser/managed-canvas.png` 和依赖测试/构建日志。脚本随源码保存，可在新的合成目录复验。

实际 Host 使用本地包链接及官方初始化/模块回退流程；Maintenance 在该 Host 检查中使用合成服务，其真实 Engine 行为由 Maintenance 测试覆盖。本次未执行真实副本部署、正式组合 strict install 或 Vault 迁移，未将这些工作声称为验收通过。

## 保留的范围与限制

P3 的图谱支持已实现。P2 独立会话贴纸类型、既有 Vault 对象迁移和 P4 全局维护网络继续由各自后续任务承担。当前支持挂接既有对象，并不声称图谱拖线能创建 Obsidian 原生双链。

图预览在来源版本变化后要求刷新/重新选择；已发送引用的固定上游机制不受影响。图编辑保存在用户明确保存的修订中，未保存内容保留当前窗口并使用离开提示；不建立额外本地全文缓存。来源捕获成功但 Core 添加中断可能留下既有 pending 来源记录，自动发现仅导入 sent，当前操作可用原 ID 重试，图谱不把它作为有效已发送关系。

代码仅提交本地分支；没有推送 GitHub、安装运行副本或改变真实 Engine 的运行版本。
