---
{
  "id": "IF-suite-consumer",
  "kind": "interface",
  "title": "ThoughtDAG 接入 Annotation 与笔记对象",
  "status": "current",
  "summary": "引用创建与准备经 Core；会话贴纸改为新建会话加一条拓扑边；笔记对象只按稳定入口导航。",
  "sources": [
    {
      "path": "../../dsh/lib/client.js"
    },
    {
      "path": "../../dsh/lib/managed-graph.js"
    }
  ],
  "relations": [
    {
      "relation": "consumes",
      "to": {
        "record_id": "IF-core-client",
        "project_id": "ddcdd580-5275-5eef-9578-6de0e81fa887"
      },
      "reason": "宿主客户端实际调用addCrossSessionReference、prepareGraphReferences、resolveReferenceLink/deleteReferenceLink与openAnnotationInSession"
    }
  ]
}
---

# ThoughtDAG 接入 Annotation 与笔记对象

Annotation Core 是外部项目 ddcdd580-5275-5eef-9578-6de0e81fa887。这些前端方法的唯一合同按本页关系中的项目 ID 与 IF-core-client 条目 ID 定位（Core 的 IF-reference 仍是兼容总入口）；本页记录实际调用范围。

## 直接调用 Core

- add-reference 先解析目标原生会话，再调用 addCrossSessionReference，传来源捕获和操作身份。
- open-session 重新解析目标；有合法入向引用时调用 prepareGraphReferences，成功后才用 DSH sessions.open 进入真实会话。
- 删除领域操作后的界面清理通过 resolveReferenceLink / deleteReferenceLink 完成；已删除按成功处理，失败保留重试。
- 打开已有 annotation 对象时，解析所属会话并调用 openAnnotationInSession。

graph-reference-actions-v1 是引用动作能力门槛；准备主干入向引用还要求 session-main-graph-v2。iframe 不直接获得 Core，也不自行伪造发送回执。

## 会话贴纸不再经过对象导航

Core 的 `native-selection-actions-v1` 提供主会话划选动作入口，ThoughtDAG 注册 `thoughtdag.session-sticker`。0.4.14-rc2.26 起这个动作**不再**创建贴纸对象、也不再发 `dsh-session-sticker-open` 事件：它在当前工作区新建一个真实会话，用 `addCrossSessionReference` 把选段作为待发送引用放进新会话输入框，并在新会话自己的图里写一条 `bound` 拓扑边。见 [[DEC-sticker-independent-20260921]]。

**贴纸对象与 `stickers` 命名空间已删除**，`open-object` 只接受 `annotation` 与 `obsidian-links`；原先「打开已有 stickers 对象导航到其会话」这条路径与它的跳转缺陷一并移除。

## 笔记的实际关联

已有 `obsidian-links` 的 note-link 使用稳定笔记入口，旧位置型对象仍有 `obsidian://open` 路径。这些操作使用提供方已有对象，不意味着本插件实现 Vault 同步或笔记重命名。

图内选文可以生成自己的材料卡。材料卡、统一引用、会话贴纸、笔记导航是不同操作，不能从一个入口的存在推断其它操作也经过同一接口。

依据：[宿主客户端 managedAction](../../../../../../dsh/lib/client.js)。基础主干图可在没有打开 Obsidian 的情况下使用；具体跨插件操作仍依赖相应能力。
