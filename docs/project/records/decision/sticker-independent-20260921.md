---
id: DEC-sticker-independent-20260921
kind: decision
title: 会话贴纸自持：一个新会话加一条单向拓扑边，不与 Maintenance 耦合
status: current
summary: 会话贴纸改为在当前工作区新建真实会话并只写一条 source=被选段会话 → target=新会话 的 bound 边；删除贴纸对象与 stickers 命名空间，插件本体不再依赖 Maintenance。
relations:
- relation: supersedes
  to:
    record_id: IF-maintenance-consumer
  reason: 贴纸与图写入不再经 Maintenance 知识接口；接入职责移交 adapter
---

# 会话贴纸自持：一个新会话加一条单向拓扑边，不与 Maintenance 耦合

来源：2026-09-21 用户逐项确认的边界。用户报告点「会话贴纸」会报
`Failed to execute 'json' on 'Response': Unexpected end of JSON input`，并明确要求把会话贴纸从 Maintenance 彻底解耦、做成由思维图自己负责的功能。

## 故障与根因

贴纸面板挂载即请求 `POST /maintenance-knowledge/api/create-workspaces`。该路由由 **Maintenance 插件**提供；实例没装它时宿主返回 **405 + 0 字节**，而 `src/maintenance/session-stickers.ts` 的 `knowledgeRequest` **先 `response.json()` 后判 `ok`**，于是抛出 JSON 解析错误。测试夹具同时伪造了一个总是返回 200 的 maintenance 服务端，掩盖了这条路径。

本机实测（只读）：`POST /maintenance-knowledge/api/create-workspaces` → 405、0 字节；`GET /thoughtdag/api/managed/create-workspaces` → 200。

## 决定

1. **不再依赖 Maintenance**：插件本体不得调用 `/maintenance-knowledge/*`，不得 import 或依赖 maintenance 相关包（含指向维护仓库的 `file:` 依赖）。将来 Maintenance 的接入由 **adapter** 承担。
2. **会话贴纸本质是一个新会话**：选中文字 → 点「会话贴纸」→ 在**当前工作区**新开一个真实 DSH 会话（同一个工作区，不额外选工作区），新会话里以**引用**形式带上被选段；引用授权仍归 Core 的引用语义，且**不自动发送**。
3. **思维图记拓扑**：新会话的图里只有一条**单向**绑定边 `source=被选段会话 → target=新会话`；被选段会话的图上**不重复存**这条边，它的支流由画布按反向关系呈现。绑定边只表达拓扑、**不代表内容授权**（与本仓库既有 `bound` 边语义一致，不带 `relationId`）。
4. **不再单独存「贴纸」对象**：会话贴纸 == 新会话 + 绑定边，没有贴纸对象、没有 `stickers` 命名空间、没有贴纸历史列表，也没有 `sticker` 图节点类型。
5. **存储沿用宿主 storages / 扩展对象**：图继续存在 `dsh_session_extensions_v1.json` 的 `thoughtdag` 命名空间，模仿 Core 的做法，不引入新的外部存储。
6. **新建会话放宿主端**：走 `/thoughtdag/api/managed/create-sticker`（内部用确定性 sessionId 创建，天然幂等），而不是让客户端各自开会话。

## 影响范围

- `dsh/lib/managed-graph.js`：新增 `POST /thoughtdag/api/managed/create-sticker`；`OBJECT_NAMESPACES` 去掉 `stickers`。
- `dsh/lib/session-graph.js`：新增 `createSticker`；节点类型白名单去掉 `sticker`；`relations` 投影补 `selectedText`/`sourceOccurrence`。
- `dsh/lib/client.js`：新增 `current-workspace`（由宿主 `workspaces` 投影的 `sessionIds` 反查当前会话工作区）；`open-object` 删除 `stickers` 分支。
- `src/maintenance/SessionStickerPanel.tsx`：简化为一次点击（建会话 → 放引用 → 进入会话）；`src/maintenance/session-stickers.ts` 删除。
- `src/maintenance/contracts.ts`：新增，就地声明原先经 `file:` 依赖从 Maintenance 仓库引入的类型。

## 验证与边界

已通过：`tsc -b`、`vitest` 27 项、`node --test dsh/tests` 25 项、`node --test src/maintenance` 44 项；`verify-ui.mjs` 的贴纸断言已改为直接打插件真实 `/thoughtdag/api` 路由。

未验证：**真实实例**里「新建空会话 → 打开 → Core 把待发送引用放进目标输入框」的端到端时序。结构上成立（空会话的输入栏仍在 shell 层渲染，composer 注册不依赖历史），但需要一个装了新包并重启后的实例才能验收。

已知有损点：本地 `annotation-upstream` 记录不含来源正文，因此来源标记的 `sourceOccurrence` 固定为 0，重复文本场景的精确落点可能偏。

边界：本决定不改变「引用才是读取授权」这条总原则，也不把绑定边变成任何形式的读取许可。
