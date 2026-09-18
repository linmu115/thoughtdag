---
id: IF-suite-consumer
kind: interface
title: ThoughtDAG 接入 Annotation、贴纸和笔记
status: current
summary: 引用创建与准备经Core；已有贴纸和笔记只按各自入口导航。
sources:
- path: ../../dsh/lib/client.js
- path: ../../dsh/lib/managed-graph.js
relations:
- relation: consumes
  to:
    record_id: IF-core-client
    project_id: dd46311f-d98d-49ff-ae13-fef0a8a6f9c3
  reason: 宿主客户端实际调用addCrossSessionReference、prepareGraphReferences、resolveReferenceLink/deleteReferenceLink与openAnnotationInSession
---

# ThoughtDAG 接入 Annotation、贴纸和笔记

DSH–Obsidian Suite 是外部项目 dd46311f-d98d-49ff-ae13-fef0a8a6f9c3。这些前端方法的唯一合同按本页关系中的项目 ID 与 IF-core-client 条目 ID 定位（Suite 的 IF-reference 仍是兼容总入口）；本页记录实际调用范围。

## 直接调用 Core

- add-reference 先解析目标原生会话，再调用 addCrossSessionReference，传来源捕获和操作身份。
- open-session 重新解析目标；有合法入向引用时调用 prepareGraphReferences，成功后才用 DSH sessions.open 进入真实会话。
- 删除领域操作后的界面清理通过 resolveReferenceLink / deleteReferenceLink 完成；已删除按成功处理，失败保留重试。
- 打开已有 annotation 对象时，解析所属会话并调用 openAnnotationInSession。

graph-reference-actions-v1 是引用动作能力门槛；准备主干入向引用还要求 session-main-graph-v2。iframe 不直接获得 Core，也不自行伪造发送回执。

## 贴纸和笔记的实际关联

session-sticker 检查配套贴纸入口后发出 dsh-session-sticker-open 事件，携带选区定位供贴纸插件处理。它不是 ThoughtDAG 自己的会话贴纸存储器。

已有 stickers 对象导航到其会话；已有 obsidian-links 的 note-link 使用稳定笔记入口，旧位置型对象仍有 obsidian://open 路径。这些操作使用提供方已有对象，不意味着本插件实现 Vault 同步、笔记重命名或普通贴纸增删。

图内选文可以生成自己的材料卡。材料卡、统一引用、会话贴纸、笔记导航是不同操作，不能从一个入口的存在推断其它操作也经过同一接口。

依据：[宿主客户端 managedAction](../../../../../../dsh/lib/client.js)。基础主干图可在没有打开 Obsidian 的情况下使用；具体跨插件操作仍依赖相应能力。
