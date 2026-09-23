# ThoughtDAG for DSH

> 当前运行环境：**DSH 0.1.5-rc.2 实例 / web profile**（0.1.5rc2）。其他 DSH 版本尚未验收。


**0.4.14-rc2.28 · DSH 0.1.5-rc.2 · 依赖 Annotation Core**

本版为工作区等待、网络请求和 Core 动态替换补齐卸载边界；许可服务断开时暂停写入，恢复后重新核验。

每个会话对应一张图，图中默认包含所属会话卡片。DAG 负责图合法性、增删和交互；图数据通过 Core 会话数据端口持久化，不建立自己的业务数据库。无需 Maintenance、Launcher、Obsidian 或普通贴纸即可打开和保存会话图。

**0.4.14-rc2.27 把「会话贴纸」从 Maintenance 彻底解耦，并改成「一个新会话 + 一条单向拓扑边」**：在会话里选中一段已完成的 AI 回复 → 点「会话贴纸」→ **在同一个工作区新开一个真实会话**（不再让你选工作区），把这段选文以**引用**形式放进新会话的输入框**待发送**（不自动发送）。新会话的图里记一条**单向**绑定边 `source=被选段会话 → target=新会话`；被选段会话的图上不重复存这条边，它的支流由画布按反向关系呈现。

绑定边只表达拓扑，**不代表内容授权**：它不带 `relationId`，授权读取仍然只来自 Core 的引用，而且只在你真正发送之后生效。**不再有贴纸对象、`stickers` 命名空间、贴纸历史列表，也不再要求选择工作区**。DAG 现在只跟本地数据与宿主打交道（`/thoughtdag/api/managed/*`）；将来 Maintenance 的接入由 adapter 承担，插件本体不依赖它。

0.4.14-rc2.25：修复「画布连线保存被拒」——图校验曾要求每条连接都必须表达上下文授权，而**上游绑定**连接（`bound`，id 形如 `bound:<来源>:<目标>`）是纯拓扑、本来就不带授权字段，于是两个会话互相绑定后整张图会被判为非法、无法保存。现在绑定连接按拓扑校验：不得声明 `relationId` / `namespace` / `sourceVersionId` / `cutoffEventId` / `state`（报「上游绑定连接不能声明上下文权限」），也不参与环检测；待绑定、上游与分支连接的校验未放宽。

0.4.14-rc2.24 及以前：修复初始空图缺少所属卡片，以及从错误的会话列表字段读取标题的问题。图和会话卡片读取宿主正式标题投影，旧图立即可显示当前名称；名称刷新不修改布局和修订。固定材料卡、普通对象和空卡片的自定义名称保留。

会话页点“思维图”；右键添加已有会话/空卡片，按来源到接收目标连接并确认上下文引用。回到真实会话检查引用后自行发送。卡片加入图不等于授予来源读取权限。

## 动态依赖与生命周期

### 可选写入许可服务的断开与恢复

`sessionWriteAccess` 保持可选，通过动态注入观察，不成为插件的必需依赖。实例从未提供这项服务时可独立写入；一旦出现过，后续写入必须通过它的 `assertWritable()`。服务暂时断开时拒绝写入但保留读取；重新注册并允许写入后恢复。许可检查过程中发生服务切换也拒绝当前操作，要求重试。不依赖提供这项公共服务的具体插件。2026-09-23 合成回归通过，实机动态重载及 UI 未验收。

## 部署方法

**环境要求**：Node.js 24，可正常启动的 DSH `0.1.5-rc.2` / `web` profile。**必须先安装 Annotation Core**。不需要 Maintenance、Launcher、Obsidian 或普通贴纸。

从 [Release dsh-v0.4.14-rc2.28](https://github.com/linmu115/thoughtdag/releases/tag/dsh-v0.4.14-rc2.28) 下载 `dsh-thoughtdag-0.4.14-rc2.28.tgz`（**不要**用 npm `@latest` 或上游 ThoughtDAG 桌面包代替），然后：

```powershell
$env:DSH_HOME = '<你的 DSH_HOME>'
dsh plugin --profile web add ./dsh-thoughtdag-0.4.14-rc2.28.tgz
```

安装顺序为 Core → DAG。安装命令会把包写进 profile 并在 `dsh.profile.bundles` 注册，**不要**再手工插入同名插件节点。随后正常重启 DSH 使新版本加载。

**用法**：在会话页点「思维图」。右键可添加已有会话或空卡片，按来源到接收目标连线并确认上下文引用；回到真实会话检查引用后自行发送。卡片加入图**不等于**授予来源读取权限。

**更新**：停止 DSH，备份 DSH_HOME，`plugin add` 新 tgz，重启并刷新页面。
**卸载**：`dsh plugin --profile web remove dsh-thoughtdag`。

完整说明（安装顺序、数据保留、故障定位）：[INSTALL.md](docs/INSTALL.md)。本批为预发布，当前能力和未完成验收见 [发布验证记录](docs/RELEASE-20260923.md)。

## 已知问题

### 添加会话卡片报「会话缺少稳定身份」（0.4.14-rc2.24 已修）

在图中添加已有会话卡片时曾报：

```
会话缺少稳定身份，请刷新目录。
```

原因：身份字段在独立架构改名后，客户端没有跟着改。宿主返回的会话目录项（Core 的 `local-session-context.ts` 中 `directory()`）只有 `{ id, title }`，**没有 `logicalSessionId`**；而 DAG 的会话选择器要求 `item.logicalSessionId`，缺失即抛错。

**独立部署下 `id` 就是会话身份**，不再有「逻辑身份 / 原生身份」两套。宿主侧的图模块早已按这个事实兜底（`row.logicalSessionId ?? row.id`），**0.4.14-rc2.24 让前端选择器采用同一兜底**。

### 打开贴纸对象跳转失败（0.4.14-rc2.27 随功能移除，不再适用）

曾经：DAG 打开**贴纸**对象时，向宿主 `resolve` 接口发送的是 `logicalSessionId`，而宿主只接受 `nativeSessionId` 或 `logicalSessionId` 二选一且校验严格，两条分支都会失败；打开注释对象的那条路径已经改用 `nativeSessionId`，贴纸这条漏了。

本版删除了贴纸对象与 `stickers` 命名空间（会话贴纸改成「新会话 + 单向拓扑边」），这条失败路径的代码已一并移除，**问题不再存在**。此条保留仅作历史定位；注释对象的 `open-object` 路径不受影响。

### 上游绑定无法被模型自行读取（未修复，待定方案）

**现状**：上游绑定（`bound:source:target`）是纯拓扑，不带锚点、不授权。DAG 会把当前会话的支流清单静默注入提示（`<dsh-thoughtdag-upstream>`，见 `managed-entry.js` 的 `upstreamNotice`），所以模型**知道**有哪些上游会话，但**没有任何手段去读它们**。

**为什么不能「知道 id 就直接读」**：

- DSH 确实有原生跨会话查询引擎 `ctx.sessionQuery`（`@deepseek-ai/dsh-session-query`）：`observeSession` / `readSession` / `searchSessions` / `searchEvents` / `traceSession` / `listSessions` 等，**完全不涉及引用授权**，按会话 id 即可读。
- 但它是 **Cordis 服务，不是模型工具**。运行时全部 `dsh-tool-*` 包中没有任何会话查询工具（已逐个核对：ask-user / bash / bash-persistent / cordis / fs / fs-search / goal / jobs / present / pwsh / pwsh-persistent / ralph / skill / str-replace-editor / subagent / subagent-control / todo / web / workflow）。模型手上没有可调用的入口。
- 模型唯一可见的跨会话读取工具是 Core 的 `dsh_upstream_read` / `dsh_upstream_search`，而它们**只接受已提交引用的 `referenceId`**，实现里显式拒绝其它一切来源（`当前轮次没有这个已提交的上游引用；未发送草稿和其它会话引用不可读取`）。这是 Core 的引用机制，与 DAG 的绑定无关。

**可行路线（待定）**：插件可以注册模型工具（`@deepseek-ai/dsh-tools` 暴露 `tools: ToolRuntime` 并导出 `defineTool`），由 DAG 注册一个工具，授权来源改为**当前会话图中声明的绑定**，内部调 `sessionQuery` 读取。在此之前必须先确定四件事：

1. 读取范围是否严格限定在「当前会话图里的上游绑定」；
2. 起点（默认最新优先，还是固定截止点）；
3. 每轮与每次读取的字节/条目上限（`sessionQuery.readSession` 会返回完整日志，无内建边界）；
4. 是否需要在读取时留下可审计回执。

**决定**：本项暂不实施，留作后续。作者计划另行参考 Codex 的跨会话读取方法后处理。

