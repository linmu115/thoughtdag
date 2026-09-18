# ThoughtDAG · DSH 会话主干图

当前职责修订见 [[DEC-selection-ownership-20260918|划选与会话贴纸归属]]；旧版入口说明以此修订为准。

## 这个项目做什么

把真实 DSH 会话的上下文来源组织成可操作的主干图。开发者可以添加会话卡片、确认有向引用、进入接收会话继续提问，查看固定来源、读取位置和当前保留材料。模型执行与用户发送仍在真实会话中完成。

例如 X → Y：X 是来源，Y 是接收并回答的会话，关系只显示在 Y 的主干里。添加 X 的卡片还没有读取权限；确认固定来源后才得到引用。

## 先从这里读

- **想了解规则**：[[OBJ-main|图、卡片与引用边]]、[[OBJ-context-state|授权、窗口与保留]]、[[DEC-data-boundary|为什么只维护轻量主干]]。
- **想了解怎么操作**：[[REQ-create|右键和开始会话]]、[[REQ-remove|撤销与刷新]]、[[MOD-source-reading|来源预览与上下文面板]]。
- **想查负责模块**：[[MOD-managed|插件总览]] → 会话外壳、画布编辑、图状态合并、来源面板、宿主桥接；[架构图](map-node:architecture/managed)中的节点可继续打开对应记录。
- **想改外部接入**：[[IF-integration|协作入口]] → [[IF-maintenance-consumer|接入 Maintenance]] 或 [[IF-suite-consumer|接入 Annotation 与贴纸/笔记]]。合同留在提供方唯一位置。
- **想判断做到哪**：[[IMP-current|当前实现与限制]]；[[VER-product-evidence|历史产品验证]]与[[VER-adoption|本次地图验证]]各自说明范围。

## 项目身份和范围

本地图沿用项目 ID 9b066b81-bb0e-4c2a-b528-56c24499f886，定位于用户指定任务“canvas树会话笔记联动系统”开发的 dsh-thoughtdag。身份核对、任务来源和本次源码指纹见 [[DEC-selection]] 与 source-review-2026-09-16.json。

这张地图聚焦 ThoughtDAG 仓库的 DSH 受管插件。独立 ThoughtDAG 应用的问答画布、Session Atlas、模型代理仍属于同仓库的另一入口，本轮没有展开它们的完整项目档案。React Flow、共享类型包等是实现依赖，不因此成为独立项目成员。

Maintenance 是独立提供方；DSH–Obsidian Suite 在引用、会话贴纸和笔记导航上存在实际接入。这里仅保留消费说明和项目/记录 ID，不复制两个项目的内部模块或合同。

## 当前边界

已有唯一主干、延迟建会话、固定引用、来源预览、读取位置、统一撤销、归档只读、布局恢复和来源上下文管理界面。当前源码插件版本为 0.4.14-rc2.13；历史发布记录与本次只读源码核对分开。

[[DEC-retired-global|全局网络等入口已经退役]]；[[DEC-pending-simplification|进一步精简仍是提议]]。原生 Agent 的材料释放由对应宿主服务落实，托管 Codex 引擎的额外适配已被用户排除在该阶段之外。

## 阅读和维护

A、B 和“更新记录”共用这张项目地图。阅读页是按需导出的快照，原记录变化后重新生成。提问继续在现有 Codex 会话中进行。
