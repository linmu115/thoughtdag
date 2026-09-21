---
id: IF-upstream-notice
kind: interface
title: 向当前会话注入上游拓扑说明
status: current
summary: 插件把当前会话图声明的上游支流注入 systemPrompt 动态上下文，只说拓扑，不授权读取。
sources:
- workspace_id: source
  path: dsh/lib/managed-entry.js
  symbol: upstreamNotice
- workspace_id: source
  path: dsh/lib/session-graph.js
  symbol: createSessionGraph
- path: ../../dsh/README.md
relations:
- relation: implements
  to:
    record_id: REQ-upstream-binding
- relation: consumes
  to:
    record_id: IF-core-client
    project_id: dd46311f-d98d-49ff-ae13-fef0a8a6f9c3
  reason: 提示文本明确指向 Core 的 dsh_upstream_read / dsh_upstream_search，并复述它们只接受已提交引用这一边界
---

# 向当前会话注入上游拓扑说明

## 这个接口解决什么问题

上游绑定是纯拓扑：它不创建引用、不带锚点、不注入正文，所以模型完全不知道自己的图里有哪些上游。用户在 2026-09-21 要求「单纯拓扑绑定」，又必须让模型知道支流存在，于是插件在组装提示时把自己图上声明的上游**名字与拓扑**说一遍——**只说形状，不给内容**。

## 交接内容

| 项 | 说明 |
|---|---|
| 提供方 | ThoughtDAG 的宿主入口 `dsh/lib/managed-entry.js` |
| 接收方 | 当前会话的模型上下文（`systemPrompt` 动态上下文） |
| 注册名 | `thoughtdag:upstream-branches`，`order: 10` |
| 触发条件 | 当前会话的图存在且图里至少有 1 条上游绑定边或至少 1 条带 `relationId` 的上游引用边 |
| 交付形式 | 一段 `<dsh-thoughtdag-upstream>` … `</dsh-thoughtdag-upstream>` 文本，逐行「<label>（<sourceSessionId>）→ 本会话（上游绑定：仅拓扑，未读取任何内容）」，带引用的来源行为「（已有固定来源引用）」 |
| 空结果 | 没有绑定、没有图、图已归档、会话 id 缺失时返回空字符串，动态上下文因此不贡献任何文本（不占上下文） |

## 接收方得到什么、得不到什么

- **得到**：上游会话的显示名与会话 id、这一层关系的存在、以及明确写的边界——「这是拓扑信息，不是内容授权」「绑定不授予读取权限」「`dsh_upstream_read` / `dsh_upstream_search` 只接受已提交引用的 `referenceId`」。
- **得不到**：任何上游正文、任何读取许可。绑定不会让模型获得读取能力。

## 失败与降级行为

- 宿主没有 `systemPrompt` 或没有 `sessionExtensionData` 时，`applyUpstreamContext` 直接返回，插件其余功能不受影响。
- `data.list` 是同步的，提供方不需要 I/O；因此这个注入不会阻塞会话组装。
- 图被删除（`deleted`）或属于别的会话时视为无绑定。

## 改变后谁受影响

- 提示文案与行格式属于模型可见输出：改动会影响模型对自身上下文的理解，需要同时更新 [[VER-binding]] 里的断言。
- 该注入**不是**读取授权：若将来新增读取工具，授权范围必须另行决定，不能因为模型「看到」支流就自动可读。这是当前登记的未决问题，见 [[IMP-binding-20260921]]。
