---
id: DEC-selection-ownership-20260918
kind: decision
title: 划选引用与会话贴纸的明确归属
status: current
summary: Core 拥有原生主会话划选，ThoughtDAG 拥有跨会话入口及会话贴纸，Sidechat 与普通贴纸分别贡献自己的动作。
related_records: [DEC-sticker-independent-20260921]
---

# 划选引用与会话贴纸的明确归属

> **后续修订（2026-09-21）**：本页关于「会话贴纸在图内创建、删除恢复」的形态已由 [[DEC-sticker-independent-20260921]] 取代 —— 会话贴纸不再是一个存储在 `stickers` 命名空间的扩展对象，而是「一个新会话 + 一条单向拓扑边」。**归属结论本身不变**：主会话划选归 Core，跨会话引用与会话贴纸归思维图，Sticker Board 只保留普通贴纸。删掉的是贴纸对象的存储形态，不是这里划定的职责边界。

来源：2026-09-18 用户在本任务逐项批注，明确要求将会话内引用交给 Core、跨会话引用和会话贴纸交给思维图，Sticker Board 只保留普通贴纸及 Obsidian 双向链接；Sidechat 核心行为保持。

本决定替代旧文档中「Sidechat 拥有主会话划选与跨会话入口」「Sticker Board 拥有会话贴纸和蓝色来源标记」的职责描述。底层 Core / Maintenance 数据归属未变，既有对象未重建或删除。

实现版本：Core 0.3.12-rc2.19、Sidechat 0.4.7-rc2.14、Sticker Board 0.7.3-rc2.19、ThoughtDAG 0.4.14-rc2.14。Core 发布 native-selection-actions-v1；各消费者注销自己的动作。普通贴纸迁移保留在 Sticker Board；会话贴纸沿用已有数据，在图内创建、删除恢复。新引用使用原预览版本和选文 occurrence。

验证：类型检查和构建通过；Core 255、Sidechat 99、Sticker Board 118、ThoughtDAG 30 项单元测试，以及思维图 49 项既有检查、20 项合成浏览器检查通过。合成浏览器不使用用户数据、不调用模型；当时尚未安装；后续安装结果见下文。

## 本次开发历程草稿

先核查功能的实际提供方，再根据用户批注收缩模块职责。用户提醒另一任务优化引用 UI；与任务 01a0b217-69f9-71a2-b574-bff353060fa9 协调后接手生产源码，保留其引用气泡、空输入提交和纵向菜单优化。旧数据迁移识别为普通贴纸能力，留在原插件，避免跟随会话贴纸误迁。

迁入测试先暴露缺少 subscribe 的 Core 测试替身、旧版本断言和 ThoughtDAG 的 JSX 测试配置；修正测试宿主后通过。新增固定预览版本、完整 occurrence 和动作卸载测试。当前公开对话为来源，未绑定原始会话事件索引；原始 UI 优化归档不覆盖。

## 提交与副本安装

用户后续明确要求提交本次改动并安装入 0.1.5-rc.2 副本，替换旧对应插件。安装包、移出的旧目录和配置备份统一归档于 artifacts/selection-ownership-20260918；生产 UI 优化与已有提交进度支持保留。最终安装回执另行记录，不能将包构建通过等同运行时验收。

## 安装结果

已按用户授权安装到 0.1.5-rc.2 副本/web，四个旧包目录移出 node_modules，归档在 artifacts/selection-ownership-20260918/rollback/packages。配套依赖与锁文件、扩展版本声明已更新；包文件逐字节核验、19 项 Maintenance 完整性检查及 peer 检查通过，原生空正文引用补丁保留。运行服务已提供与新包相同的 host-markers.js；现有 Launcher 管理进程未重启，完整激活和真实交互仍待重启后验收。没有发布 npm 或推送远端。
