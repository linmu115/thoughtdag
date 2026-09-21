---
id: IMP-current
kind: implementation
title: 当前受管图能做什么
status: current
summary: 现有源码实现主干、真实会话、拓扑绑定、固定引用、撤销和三层上下文界面。
progress: implemented
gap: 本轮未重跑原生模型、真实副本和长时并发；复杂旧图归属按具体资料验收。托管引擎额外适配明确不在阶段范围。绑定边能否保存、绑定对模型不可读、贴纸跳转未修见绑定实现记录。
sources:
- path: ../../dsh/package.json
- path: ../../dsh/README.md
- path: ../../src/maintenance/ManagedGraphApp.tsx
- path: ../../src/maintenance/SourceContextPanel.tsx
relations:
- relation: implements
  to:
    record_id: REQ-main
- relation: implements
  to:
    record_id: REQ-create
- relation: implements
  to:
    record_id: REQ-remove
- relation: implements
  to:
    record_id: REQ-storage
- relation: implements
  to:
    record_id: REQ-disclosure
- relation: implements
  to:
    record_id: REQ-context-ui
- relation: implements
  to:
    record_id: REQ-presentation
---

# 当前受管图能做什么

本次只读核对的 dsh-thoughtdag 版本为 0.4.14-rc2.13，目标 DSH 0.1.5-rc.2。源码快照以 source-review-2026-09-16.json 为准；历史部署报告对应报告所列实例和版本。

**后续版本**：2026-09-21 的 0.4.14-rc2.24 改动了连线语义并补齐关系边，见 [[IMP-binding-20260921]]。下表描述的各项能力除非该记录另有说明，仍然成立；下表所在版本仍是 0.4.14-rc2.13。

| 功能 | 当前行为 | 条件或限制 |
|---|---|---|
| 单会话主干 | 按需 ensure，已有同会话主干复用 | 普通浏览不批量建图；非当前主干的操作先确认归属 |
| 卡片与开始会话 | 目录分页、占位、工作区确认、绑定、进入真实会话 | 取消不创建；用户自己发送 |
| 上游拓扑绑定 | 连线只写 `bound` 边：不创建引用、不弹确认、不读取上游正文 | 2026-09-21 起的行为，见 [[REQ-upstream-binding]]；绑定不等于读取授权 |
| 固定引用 | 完成回复/版本确认，多父来源；合法入向引用准备 | pending 与绑定边都不能读；来源更新不扩旧上限 |
| 阅读与管理 | 固定预览、位置日志、请求目录、不连续窗口、暂停/恢复、固定/释放 | 预览不冒充模型已读；实际释放以服务回执和原生执行边界为准 |
| 删除与归档 | 领域撤销、Core 清理重试、事件/可见性刷新，归档只读 | 既有回答保留；恢复不复活已撤销关系 |
| 编辑与恢复 | 手动布局、主动重排、修订合并、无权限恢复草稿 | 旧混合图待归属；恢复草稿不复制活动授权 |
| 名称与表现 | 图/会话卡随会话名更新；尺寸缓存避免拖动闪烁；连续切换、主题与键盘菜单 | 材料名称独立；未声称用户设备长时帧率已测 |

## 未覆盖、退役和提议分别看

- **本次未重验**：真实模型输入释放、用户数据操作、运行副本、跨宿主长时并发，以及全部复杂旧图归属迁移；本次只整理地图与核对源码。
- **阶段外**：用户明确暂不处理托管 Codex 引擎的额外上下文释放适配；不算本插件 UI 缺失。
- **已退役**：[[DEC-retired-global|全局维护网络、影响查看、准备重答专属入口]]，不列成待办。
- **仍是提议**：[[DEC-pending-simplification|材料卡、对象浏览器和手动保存的进一步精简]]，没有擅自认定删除。
- **另一入口**：独立 ThoughtDAG 的模型代理、Session Atlas 和独立画布问答保留，未被本受管插件使用。

能力兼容见 [[IF-maintenance-consumer]] 与 [[IF-suite-consumer]]；使用方式见 [[IMP-binding-20260921]]、[[IMP-migration]]；证据与本次检查见 [[VER-binding]]、[[VER-product-evidence]]、[[VER-adoption]]。
