# ThoughtDAG for DSH

**0.4.14-rc2.20 · DSH 0.1.5-rc.2 · 依赖 Annotation Core**

每个会话对应一张图，图中默认包含所属会话卡片。DAG 负责图合法性、增删和交互；图数据通过 Core 会话数据端口持久化，不建立自己的业务数据库。无需 Maintenance、Launcher、Obsidian 或普通贴纸即可打开和保存会话图。

本版修复初始空图缺少所属卡片，以及从错误的会话列表字段读取标题的问题。图和会话卡片读取宿主正式标题投影，旧图立即可显示当前名称；名称刷新不修改布局和修订。固定材料卡、普通对象和空卡片的自定义名称保留。

会话页点“思维图”；右键添加已有会话/空卡片，按来源到接收目标连接并确认上下文引用。回到真实会话检查引用后自行发送。卡片加入图不等于授予来源读取权限。

## 部署方法

**环境要求**：Node.js 24，可正常启动的 DSH `0.1.5-rc.2` / `web` profile。**必须先安装 Annotation Core**。不需要 Maintenance、Launcher、Obsidian 或普通贴纸。

从 [Release dsh-v0.4.14-rc2.20](https://github.com/linmu115/thoughtdag/releases/tag/dsh-v0.4.14-rc2.20) 下载 `dsh-thoughtdag-0.4.14-rc2.20.tgz`（**不要**用 npm `@latest` 或上游 ThoughtDAG 桌面包代替），然后：

```powershell
$env:DSH_HOME = '<你的 DSH_HOME>'
dsh plugin --profile web add ./dsh-thoughtdag-0.4.14-rc2.20.tgz
```

安装顺序为 Core → DAG。安装命令会把包写进 profile 并在 `dsh.profile.bundles` 注册，**不要**再手工插入同名插件节点。随后正常重启 DSH 使新版本加载。

**用法**：在会话页点「思维图」。右键可添加已有会话或空卡片，按来源到接收目标连线并确认上下文引用；回到真实会话检查引用后自行发送。卡片加入图**不等于**授予来源读取权限。

**更新**：停止 DSH，备份 DSH_HOME，`plugin add` 新 tgz，重启并刷新页面。
**卸载**：`dsh plugin --profile web remove dsh-thoughtdag`。

完整说明（安装顺序、数据保留、故障定位）：[INSTALL.md](docs/INSTALL.md)。本批为预发布，当前能力和未完成验收见 [发布验证记录](docs/RELEASE-20260920.md)。

## 已知问题

### 添加会话卡片报「会话缺少稳定身份」（0.4.14-rc2.20 已修）

在图中添加已有会话卡片时曾报：

```
会话缺少稳定身份，请刷新目录。
```

原因：身份字段在独立架构改名后，客户端没有跟着改。宿主返回的会话目录项（Core 的 `local-session-context.ts` 中 `directory()`）只有 `{ id, title }`，**没有 `logicalSessionId`**；而 DAG 的会话选择器要求 `item.logicalSessionId`，缺失即抛错。

**独立部署下 `id` 就是会话身份**，不再有「逻辑身份 / 原生身份」两套。宿主侧的图模块早已按这个事实兜底（`row.logicalSessionId ?? row.id`），**0.4.14-rc2.20 让前端选择器采用同一兜底**。

### 打开贴纸对象跳转失败（未修复）

DAG 打开**贴纸**对象时，向宿主 `resolve` 接口发送的是 `logicalSessionId`（`dsh/lib/client.js`），而宿主只接受 `nativeSessionId` 或 `logicalSessionId` 二选一且校验严格，两条分支都会失败。打开注释对象的那条路径已经改用 `nativeSessionId`，贴纸这条漏了。

**未修复。** 本记录只登记，不代表已修或已验证。

