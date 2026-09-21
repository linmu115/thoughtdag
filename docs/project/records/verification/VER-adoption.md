---
id: VER-adoption
kind: verification
title: 本次地图整理的验证范围
status: current
summary: 地图、4个跨项目目标和本地链接已核对；原生两图通过，保留构图提示。
relations:
- relation: verifies
  to:
    record_id: IMP-current
sources:
- path: checks/map-review-2026-09-16.json
- path: source-review-2026-09-16.json
---

# 本次地图整理的验证范围

| 地图自身版本 | 关系 | 用途 |
|---|---|---|
| [source-review-2026-09-21.json](../../source-review-2026-09-21.json) | 本次修订（42→44 条记录）的来源、代码与测试基线 | 本轮说明对应的源码指纹与实跑命令 |
| [source-review-2026-09-16.json](../../source-review-2026-09-16.json) | 初次接入与 2026-09-16 修订 | 保留原样，不覆盖 |
| [source-baseline.json](../../source-baseline.json) | 首次接入前基线 | 保留原样 |

## 2026-09-21 修订（绑定语义）的检查

本次对象是同一张地图，源码起点为 547f9f76f6f1aba9e74c94cbc6f7e60659edaa0a（分支 `codex/independent-plugins-20260920`，工作树干净，除 `docs/project/` 外无改动）。

- `project_map.py validate` 通过：45 条记录，无错误、无警告。
- `read --include-history` 与 `search --include-history` 已实测可展开三条归档记录（旧 MOD-canvas 读法、旧的 MANAGED 使用流程绑定、旧的能力与边界绑定），默认查询只返回短定位与后继。
- 修正了地图自身两处失效来源：原先指向 `dsh/MANAGED.md` 的四个绑定（IMP-usage、IMP-migration、IF-capability、VER-graph）中，该文件已被重写为单一标题，这些标题全部不存在；IMP-usage 与 IF-capability 按归档处理，IMP-migration 与 VER-graph 改为绑定仍然存在的 `dsh/docs/INSTALL.md`。另一个失效来源是规格工作树的相对路径（原写法多出一层 `repositories`），现已改回真实位置。
- 原生 Archify 两图更新后重新校验：架构图节点标签由「连接确认」改为「拓扑绑定」；流程图把 `connect` 的语义改为只发布拓扑绑定，引用动作接在其后。两图 `compositionStatus: pass`。
- 阅读页已重新导出（本机 HTTP 阅读服务运行中）。本次没有重启实例、没有在浏览器里点开页面逐项核对。

## 2026-09-16 修订的检查

本次对象为 ThoughtDAG 受管插件的项目地图，当前源码起点为 7e4b0876d1249fdff8580b357955e59b496a3e27。身份、选用来源及其指纹见 source-review-2026-09-16.json；初次接入的 source-baseline.json 保留不改。

- 地图 34 条记录，格式、绑定标题、来源和本地关系检查通过，无错误或警告。
- 4 个跨项目消费目标按当前工作树独立核对：Maintenance 的 IF-graph、IF-extension、IF-native-context；Suite 的 IF-core-client。提供方项目 ID 与目标记录存在，未更改全局登记。
- 地图正文中的本地文件链接逐一存在；原生架构和流程图节点均绑定当前记录。旧记录 ID 与原图节点/边 ID 保留，MOD-managed 迁入模块层级目录。
- 原生 Archify 两图都通过结构/渲染校验。架构仍有 1 处关系交叉提示；流程有 1 处关系交叉和 1 处桌面缩放后小字提示。没有重叠标签、歧义共线或容器边界错误；细节可放大查看。
- Codex 内置浏览器已实际打开 HTTP 阅读页，核对 A 的概览/两图画面、B 的分层模块目录和“更新记录”空状态；未逐个点击所有节点。完整图可放大查看。本次未新增更新条目，没有修改阅读器代码。

机械回执见 [本次地图检查](../../checks/map-review-2026-09-16.json)。图的实际导出回执与 HTTP 服务状态在 views/，它们是可重建的阅读快照。该回执对应 2026-09-16 的状态，不覆盖上节的修订。

## 与历史验证的区别

[[VER-product-evidence]]、[[VER-ui]] 和 [[VER-graph]] 保留原产品版本对应的测试与交付范围。本次没有重跑产品测试，没有操作用户会话、Vault、运行副本或模型输入，也没有进行 LLM 成本评测。

原生模型释放、复杂旧图归属与长时间并发不能由地图检查推定通过。此前初次接入的说明仍在 docs/changes/2026-09-16-project-map-adoption.md；它不替代本次回执。

## 阅读器的实际边界

本图记录和代码/资料快照可以在页内导航。跨项目关系当前显示项目 ID 和条目 ID，需按身份定位提供方；本次没有声称阅读器提供跨图点击跳转。
