> 2026-09-23 客户端生命周期修复：[[IMP-client-lifetime-20260923]]；35 项合成测试通过，未部署、UI 未验收。需求 [[REQ-client-lifetime-20260923]]，证据 [[VER-client-lifetime-20260923]]。
>
> 2026-09-22 独立构建与当前版本：[[IMP-portable-build-20260922]]；运行环境 **DSH 0.1.5-rc.2 / web profile**。

# ThoughtDAG · DSH 会话思维图

2026-09-21 会话贴纸解耦与自持：**会话贴纸不再依赖 Maintenance**，改成「一个新会话 + 一条单向拓扑边」。选段 → 点「会话贴纸」→ 在当前工作区新建真实会话（不再选工作区），选段以引用形式进入新会话输入框待发送；新会话图里只写一条 `source=被选段会话 → target=新会话` 的 `bound` 边，被选段会话的图不重复存。删除贴纸对象、`stickers` 命名空间、贴纸历史列表与 `sticker` 图节点。决定见 [[DEC-sticker-independent-20260921]]，后端路由见 [[MOD-host-server]]，画布交互见 [[MOD-canvas]]，历史接入见 [[IF-maintenance-consumer]]（已 superseded），写入门现状见 [[IMP-write-access-20260921]]，本次构建与打包见 [[IMP-sticker-release-20260921]]。

2026-09-21 上游拓扑绑定：连线只写 `bound` 边，不创建引用、不读取内容。设计边界见 [[DEC-reference-vs-binding]]，需求与验收范围见 [[REQ-upstream-binding]]，实现现状与未修问题见 [[IMP-binding-20260921]]，测试范围见 [[VER-binding]]。

2026-09-20 独立运行与接入边界：[[IMP-independent-components-20260920]]。测试实例已安装 .19，所属会话卡片与重开保持实测见 [[IMP-owner-session-card-20260920]]；名称读取缺口已修复，其他业务按各自验证范围阅读。

当前职责修订见 [[DEC-selection-ownership-20260918|划选与会话贴纸归属]]（贴纸的**存储形态**已由 [[DEC-sticker-independent-20260921]] 取代，职责边界不变）；旧版入口说明以此修订为准。

## 这个项目做什么

把真实 DSH 会话的上下文来源组织成可操作的思维图 / 主干图。开发者可以添加会话卡片、发布上游拓扑绑定、确认有向引用、进入接收会话继续提问，查看固定来源、读取位置和当前保留材料。模型执行与用户发送仍在真实会话中完成。

例如 X → Y：X 是来源，Y 是接收并回答的会话，关系只显示在 Y 的图里。**连线只登记「X 在 Y 的上游」这件事**：不创建引用、不弹确认框、不读取任何内容。添加 X 的卡片没有读取权限，连线也没有；只有经 Core 确认固定来源的引用才有读取权限，见 [[DEC-reference-vs-binding]]。

## 先从这里读

- **想了解规则**：[[OBJ-main|图、卡片、绑定与引用边]]、[[OBJ-context-state|授权、窗口与保留]]、[[DEC-reference-vs-binding|引用与绑定为什么分开]]、[[DEC-data-boundary|为什么只维护轻量主干]]。
- **想了解怎么操作**：[[REQ-upstream-binding|连线做与不做什么]]、[[REQ-create|右键和开始会话]]、[[REQ-remove|撤销与刷新]]、[[MOD-source-reading|来源预览与上下文面板]]。
- **想查负责模块**：[[MOD-managed|插件总览]] → 会话外壳、画布编辑、图状态合并、来源面板、宿主桥接；[架构图](map-node:architecture/managed)中的节点可继续打开对应记录。
- **想改外部接入**：[[IF-integration|协作入口]] → [[IF-suite-consumer|接入 Annotation 与 note 对象]]、[[IF-upstream-notice|上游拓扑如何告知模型]]、[[IF-maintenance-consumer|（历史）Maintenance 接入已解除]]。合同留在提供方唯一位置。
- **想判断做到哪**：[[IMP-current|当前实现与限制]]、[[IMP-binding-20260921|绑定实现与三项未修]]、[[IMP-write-access-20260921|可选写入许可与恢复]]；[[VER-product-evidence|历史产品验证]]、[[VER-binding|本轮测试范围]]与[[VER-adoption|本次地图验证]]各自说明范围。

## 项目身份和范围

本地图沿用项目 ID 9b066b81-bb0e-4c2a-b528-56c24499f886，项目名为 ThoughtDAG · DSH 会话思维图（别名 ThoughtDAG、思维图、会话主干图），定位于用户指定任务“canvas树会话笔记联动系统”开发的 dsh-thoughtdag。身份核对与 2026-09-16 快照见 source-review-2026-09-16.json；本次源码基线见 source-review-2026-09-21.json，初次接入的 source-baseline.json 保留不改。

这张地图聚焦 ThoughtDAG 仓库的 DSH 受管插件。独立 ThoughtDAG 应用的问答画布、Session Atlas、模型代理仍属于同仓库的另一入口，本轮没有展开它们的完整项目档案。React Flow、共享类型包等是实现依赖，不因此成为独立项目成员。

Maintenance 是独立提供方；DSH–Obsidian Suite 在引用与对象导航上存在实际接入。这里仅保留消费说明和项目/记录 ID，不复制两个项目的内部模块或合同。独立架构下图的持久化经 Core 会话数据端口；**本插件已不再调用 Maintenance 的任何接口**，[[IF-maintenance-consumer]] 的旧调用点属于历史说明，将来由 adapter 承担接入。

## 当前边界

已有唯一主干、延迟建会话、上游拓扑绑定、会话贴纸自持、固定引用、来源预览、读取位置、统一撤销、归档只读、布局恢复和来源上下文管理界面。当前源码插件版本为 **0.4.14-rc2.26**（分支 `codex/independent-plugins-20260920`）；历史上的 0.4.14-rc2.13 等版本记录与本次核对分开阅读。

必须记住的当前限制：

1. 上游绑定对模型**不可读**：绑定不等于读取授权，模型只能读用户实际提交的引用；是否新增 `upstreamRead` 风格工具尚未决定（详见 [[IMP-binding-20260921]]）。
2. 会话贴纸的**实机端到端未验收**：真实实例里「新建空会话 → 打开 → Core 把待发送引用放进目标输入框」的时序只做了结构核查，需要装包重启后的实例才能验收（[[DEC-sticker-independent-20260921]]）。
3. 来源标记的 `sourceOccurrence` 固定为 0：本地 `annotation-upstream` 记录不含来源正文，重复文本场景的精确落点可能偏。
4. 可选 `sessionWriteAccess` 的断开保护已经在源码修复，未提供时仍支持独立运行；新增动态依赖测试通过，但本次未部署、实机重载未验收（[[IMP-write-access-20260921]]）。

会话贴纸对象与 `stickers` 命名空间已删除，原先「打开贴纸对象跳转失败」这条限制随功能移除，不再适用。

[[DEC-retired-global|全局网络等入口已经退役]]；[[DEC-pending-simplification|进一步精简仍是提议]]。原生 Agent 的材料释放由对应宿主服务落实，托管 Codex 引擎的额外适配已被用户排除在该阶段之外。

## 阅读和维护

A、B 和“更新记录”共用这张项目地图。阅读页是按需导出的快照，原记录变化后重新生成。提问继续在现有会话中进行。

被替代的旧说明按归档机制保存，默认查询不会展开其正文：[[ARCH-connect-reads-upstream|旧的「连线即确认固定来源」读法]]、[[IMP-usage|旧的 MANAGED「使用流程」绑定]]、[[IF-capability|旧的「能力与边界」绑定]]。

本次维护的过程（问题、尝试、人工纠偏与保留边界）记为未索引草稿：`history-drafts/2026-09-21-sticker-decoupling.md`、`history-drafts/2026-09-21-binding-map.md` 与 `history-drafts/2026-09-21-experience-archive-record.md`。它们没有绑定可展开的宿主事件索引，因此不作正式 history/experience 记录，也不提供 history-event 依据。
