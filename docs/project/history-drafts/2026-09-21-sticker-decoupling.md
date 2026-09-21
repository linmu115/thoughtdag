# 会话贴纸解耦与自持：本轮开发历程草稿（未索引）

来源：当前用户公开任务「把会话贴纸从 Maintenance 彻底解耦」及本轮只读核查、实现、测试与验证工具输出。**未绑定可展开的宿主事件索引**，不伪造 `history-event` 回执；本段是过程草稿，不是正式 history 记录。

覆盖范围：本轮任务的可行性核查、实现、类型/单测/夹具改动、两次 mini 实测与两条 A/B 结论。不覆盖此前各轮的插件架构升级历史，也不覆盖真实实例的安装与交互验收。

## 问题与根因

用户报告点「会话贴纸」报 `Failed to execute 'json' on 'Response': Unexpected end of JSON input`。只读核查定位到：贴纸面板挂载即请求 `POST /maintenance-knowledge/api/create-workspaces`，该路由由 **Maintenance 插件**提供；实例没装它时宿主返回 **405 + 0 字节**，而 `src/maintenance/session-stickers.ts` 的 `knowledgeRequest` **先 `response.json()` 后判 `ok`**，于是抛 JSON 解析错误。

本机只读实测确认：`POST /maintenance-knowledge/api/create-workspaces` → 405、0 字节、无 `Allow`/`content-type` 头；`GET /thoughtdag/api/managed/create-workspaces` → 200。

**为什么长期没被发现**：`dsh/scripts/verify-ui.mjs` 与 `src/maintenance/session-sticker-flow.test.mjs` 都起了假的 `/maintenance-knowledge/api/*` 服务端，总是返回 200，把这条路径盖住了。这是本轮修复夹具的直接动因。

## 用户边界（逐项确认，未再讨论）

不再依赖 Maintenance；会话贴纸本质是一个新会话（同一工作区、引用形式带上选段、不自动发送）；思维图只记单向拓扑边 `source=被选段会话 → target=新会话`、只存在新会话自己的图里；不再单独存贴纸对象；存储沿用宿主 storages / 扩展对象；将来 Maintenance 由 adapter 接入。

## 两个 mini 实测结论

1. **无 Maintenance 时 `LocalSessionContext` 确实实现 `describe`**（`dsh-annotation-core/lib/index.js:6115`），返回形状与 DAG 的 `references.describe?.()` 期望一致（`described.sourceNativeSessionId` + `described.record.state`）。因此**不阻塞**。但按用户「绑定只表达拓扑」的原则，最终决定新会话图**只落 `bound` 边、不落 `upstream` 边**：上游读取授权留给用户在新会话里真正发送引用时由 Core 写入。
2. **全新空会话的原生输入框就绪时序：仅结构成立，未实机验证。** 已核实的结构事实：`dsh-client-ui-conversation` 里 blank 会话的 `ConversationSession` 返回 null，但输入栏在 shell 层渲染（`renderSlot("conversation.composer.bar")`），composer 注册挂在组件挂载上、不依赖历史。**未验证**：真实实例里「新建空会话 → 打开 → composer 注册」的端到端时序，需要一个装包并重启后的实例。此项如实标注为未验证，未当成已验收。

## 实施要点

- 删除 `src/maintenance/session-stickers.ts`（`knowledgeRequest` 与 `/maintenance-knowledge/*` 一并消失）；新增 `src/maintenance/contracts.ts` 就地声明原先经 `file:` 依赖从 Maintenance 仓库 worktree 引入的类型（含 `SourceContextPanel.tsx` 用到的原生上下文类型）；删除该 `devDependency`。
- 宿主新增 `POST /thoughtdag/api/managed/create-sticker`（确定性 sessionId，幂等）与客户端 `current-workspace`（由宿主 `workspaces` 投影的 `sessionIds` 反查工作区）。
- 来源标记改为从本图自己的 `annotation-upstream` 记录投影；解除引用改为移除目标会话图里承载该引用的那条边。
- 夹具改打插件真实的 `/thoughtdag/api` 路由。

**有损点（保留）**：本地 `annotation-upstream` 记录不含来源正文，`sourceOccurrence` 只能固定为 0，重复文本场景的精确落点可能偏。用户明确不要求为此扩写文档，代码注释已说明。

## 人工纠偏与转折

- **夹具方向被用户纠正两次**：先是「测试夹具里假装 maintenance 服务可用」被点名为本次故障被掩盖的原因，要求连带改成 DAG 自己的 managed 路由；随后用户一次性定了绑定边方向、删除贴纸对象、新建会话放宿主端、去掉编译期依赖、并加了一条「不许涉及任何 maintenance 相关的东西」。
- **提交拆分被技术事实推翻**：用户建议按「(a) 解耦 / (b) 贴纸语义」分两次提交。实测发现不可行 —— 旧面板 `import { knowledgeRequest } from './session-stickers'`，(a) 删掉该模块后树在该提交点无法通过类型检查；而 `createSticker` 是 (b) 才引入的。两个关注点在 20 个文件里互相依赖，只能一次原子提交。已就此偏离在提交说明与回报中说明，未静默处理。

## 两条既有缺陷（A/B 结论，均非本轮引入）

1. **`verify-ui.mjs` 的几何对齐断言在本机就是红的。** 失败点为 `Math.abs(main.left - host.left) < .75`，实测 `hostLeft=320 / mainLeft=0 / --dsh-left-rail` 为空（canvas 未左移）。A/B：把 `dsh/lib/client.js` 换回 HEAD 版本后，同一断言以**逐字节相同**的 30000ms 超时失败 → 与本次改动无关。未改断言去迁就。
2. **`verify-rc2.mjs` 在本机跑不到自己的断言**，且 HEAD 同样失败（同一个 `Cannot find module 'dsh-annotation-core/package.json'`，固定在 `verify-rc2.mjs:127` 的 peer 循环）。逐层排查后确认是三处既有的环境/夹具假设，本轮修掉前两处、第三处如实登记未修：
   - peer 循环假定所有 `peerDependencies` 都来自官方 runtime —— 独立架构下 `dsh-annotation-core` 是用户单独装进 profile 的消费侧插件，永远解析不到。已改为跳过并记入 `unresolvedConsumerPeers`。
   - inspector 重复 `provide` 了官方 profile 已经注册的 `workspaceRegistry` / `sessionController`，插件树以 "service has been registered" 起不来。已改为只补宿主没有的端口，并用真 `workspaceRegistry.create()` 造合成工作区。
   - **未修**：合成 profile 没有装 `dsh-annotation-core`，因此没人提供 `annotationCoreHost`，插件树停在 `dsh-thoughtdag: pending (waiting for service: annotationCoreHost)`。要跑通需把 Core 作为依赖装进合成 profile 并加载其 patch，同时删掉 inspector 里那两个会与 Core 冲突的 `provide`。已在文件内注明。

## 结果

`tsc -b` 通过；`vitest run` 27/27；`node --test dsh/tests/*.test.mjs` 25/25；`node --test src/maintenance/*.test.mjs` 44/44；eslint 由基线 12 errors 降到 8（余下 8 项均为既有问题，改动文件零新增）。

**没有**安装到实例、没有重启或触碰运行中的实例与 Vault、没有 push、没有打 tag、没有出包。

## 边界与待办

- 真实实例的端到端验收（空会话 composer 时序、待发送引用落位）仍未完成。
- `sessionWriteAccess` 未进 `inject` 列表：未装 Maintenance 时正确，接入后恢复期会被绕过。**超出本轮范围、待独立决策**，见 [[IMP-write-access-20260921]]。
- 项目地图与本文档按用户授权在本轮更新；`dsh/README.md` 的旧「选择工作区 → 新建贴纸」形态已按新语义改写。
