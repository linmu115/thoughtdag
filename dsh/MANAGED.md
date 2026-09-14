# DSH 0.1.5-rc.2 会话图谱接入

这是 `linmu115/thoughtdag` 的本地修改分支，以上游 `ef04210f6106a0dbc30f353cf67b25bee47d769c` 为基线。插件版本为 `0.4.14-rc2.1`。DSH 入口接入当前实例的 Maintenance 与 Annotation；仓库的独立应用仍保留上游能力。

## 已实现的使用流程

1. 在 DSH 会话标题栏选择“思维图”，新建画布。
2. 选择“＋ 会话”，先选择工作区，再选择会话。目录分页加载，添加卡片不读取全部历史。
3. 点击会话卡片标题进入完整会话；选中卡片后可展开局部问答。
4. 在已完成回复中选择文字，可以制作材料卡，或引用到另一会话；也可新建真实会话，形成分支来源。
5. 引用会出现在目标会话草稿中。原有正文和附件保留，由用户在完整会话页发送。初次请求优先提供来源问题与所选回复，更早上下文由既有工具按需读取。
6. 保存画布。多个画布可复用同一逻辑会话。移除卡片、移除线条呈现、解除上下文引用和移除画布是不同操作。

已有注释/贴纸和笔记链接可从“关联对象”按需挂接。笔记卡片进入既有笔记，注释/贴纸卡片打开其既有来源对象；当前已实现的会话之间的引用无需这些可选对象域。

## 三类连线

| 类型 | 含义 | 权威归属 |
|---|---|---|
| 分支来源 | 新建真实会话并加入固定上游引用 | Annotation 引用；画布保存该关系的呈现 |
| 上游引用 | 将已完成回复的固定上游作为另一会话的可读材料 | Annotation 引用 |
| 知识关联 | 用户整理关系的线条；拖动连接点不会发起模型请求 | 无领域关系 ID 时仅为画布呈现；既有笔记对象继续归原知识域 |

自动发现只导入已发送的关系。当前窗口经 Core 确认的引用草稿显示“待发送”；解除和未核对状态分别标明。画布不能通过连线赋予模型读取权，也不另存引用是否授权的真源。

## 数据与并发

- 画布通过 `maintenanceExtensionData.bridge` 保存到 `thoughtdag` 命名空间，使用 `managedSchema: 1`。
- 正文不进入图数据。材料卡只保存选中重点（最多 4,000 字符）和逻辑会话、来源版本、回复位置。
- 模型读取范围由 Annotation 与 Maintenance 固定在所选完整回复结束；图预览不是模型上下文。
- `expectedSourceVersionId` 在创建引用时由后端原子核对。预览之后来源变化会要求重新选择，不能悄悄引用不同版本。
- 预览单页完整 JSON 不超过 16,000 字节。长回复使用游标继续，不同时重送来源选择。
- 保存采用修订比较；冲突保留当前窗口编辑，用户明确选择后才重新载入。异步切换期间暂停编辑，避免覆盖。
- 图数据只写 Maintenance；此模式不启动 IndexedDB 会话持久化、自动备份、全文镜像或上游模型代理。
- 来源版本变化后，画布中旧材料的浏览会明确失效；已发送 Annotation 引用继续使用原固定版本读取机制。
- 停用 ThoughtDAG 不清除图数据，不影响独立跨会话引用。恢复后重新读取已保存对象。

## 接入依赖

需要实际 DSH `0.1.5-rc.2`，并安装包含以下能力的本地依赖源码构建：

| 项目 | 必需能力 | 本次本地基线 |
|---|---|---|
| dsh-session-maintenance | `maintenanceGraph.protocolVersion === 1`，扩展存储，ThoughtDAG `0.4.14-rc2.1` schema，来源版本核对 | `1098d6b5796073ab8791582aa78d93cee5fdb46a` |
| dsh-annotation-core | Client feature `graph-reference-actions-v1`，`addCrossSessionReference`、`resolveReferenceLink`，版本核对字段 | `028414357065b7f04ba8db5ea22f4702f8ded2f2` |

维护插件的当前实例配置需要登记 `thoughtdag` 扩展，版本为 `0.4.14-rc2.1`，并使用该实例既有的稳定 writer ID 规则。必须保留其他已配置命名空间，不能用单独一项配置覆盖现有列表。跨会话引用继续需要既有 `annotation-upstream` 配置。

公共协议由 Maintenance 的 `packages/contracts/src/session-graph.ts` 定义；平台完成事件只由 `adapter-dsh-0-1-5` 解释。ThoughtDAG Host 只调用绑定当前运行的服务，浏览器不能传入 run/profile/Engine 凭据选择另一实例。

这次只交付本地源码提交，未更新运行副本。依赖仍保持原开发版本号，因此正式发布时需要按提交及构建产物核对组合、重新生成部署回执；不能仅按相同版本号认定副本已包含这些修改。

## 开发与验证

在仓库根目录执行：

```sh
npm ci --ignore-scripts
npm run dsh:build
node --test dsh/tests/*.test.mjs src/maintenance/*.test.mjs
node dsh/scripts/verify-ui.mjs
node dsh/scripts/verify-rc2.mjs --runtime <official-rc2-runtime-root> --output <synthetic-output-root>
```

`verify-ui` 使用本机浏览器和合成服务，默认浏览器是 Windows Edge，也可用 `TEST_BROWSER` 指定可执行文件。`verify-rc2` 初始化独立测试 home，通过官方 Host 启用本地插件；实际 Maintenance 的作用域、Adapter、字节限额等由 Maintenance 仓库自己的合成测试验证。两个脚本都不发起模型请求，不连接真实 Vault。

本次已验证官方 Host 激活、客户端注入、画布资源、服务调用和真实合成空白会话创建；验证方式为本地包链接，未声称完成正式 strict install 或真实插件组合部署。

## 与后续阶段的边界

本次实现规格中的 P3 ThoughtDAG 接入，并补充必要公共接口。现有注释/贴纸、笔记对象可关联和导航。P2 中独立会话贴纸对象类型、Sticker Board 全面迁移、Vault 写入权切换仍需对应插件实现；拖出知识线不等于已经创建 Obsidian 原生双链。P4 全局维护网络、影响传播和自动重新执行继续留待后续。

当前 DSH 入口不再提供上游插件的 `/disksessions` 全文扫描、直接 `/inject`、`/stream` 和跨代理全局历史工具；这些旧桥接路由返回明确的已停用状态。完整真实会话通过 DSH 自身打开，模型上下文通过统一引用能力获得。
