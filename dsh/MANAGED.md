# DSH 会话主干图

DSH 入口使用当前实例的 Maintenance 与 Annotation 服务；仓库独立应用仍保留其原有能力。

## 使用流程

1. 在真实会话标题栏选择“思维图”，打开或复用当前接收会话的唯一主干。仅打开图面板会确保这一会话的主干，普通会话浏览不为历史会话批量建图。
2. 右键空白处选择“添加空卡片”或“添加已有会话”。已有会话按工作区、会话两级分页选择，只加卡片，不加载全部正文，也不自动授权上下文。
3. 空卡片右键“在此节点开始会话”，先选择工作区，再确认创建。取消选择不会创建会话；真正开始创建前保存工作区意图，超时重试沿用该工作区。成功后卡片绑定真实会话。
4. 已绑定卡片从同一菜单进入真实会话，准备该节点合法入向引用，保留草稿、附件和原有合法引用；模型请求仍由用户在真实会话中发送。
5. 拖动连接点或选择“连接到节点”，确定来源与接收方，然后确认已完成回复及固定源版本。未绑定卡片之间只存待绑定连接，不能读取上游。X → Y 归属于 Y 的主干，X 的主干不自动展开 Y。
6. 右键“查看来源”打开只读弹层。多条固定引用可选择范围；分页保留所选源版本。选文仍可制作材料卡、引用到会话或建立会话贴纸，没有独立聊天输入。
7. 边的“查看固定来源与读取位置”显示授权截至哪条回复、返回范围、继续位置、截断和交付状态。日志仅保存位置与计数，普通预览与模型披露分开表达，早期裁剪明确标记。
8. 右键、Delete/Backspace 和工具栏的移除操作调用同一个后端领域命令。删除卡片会撤销受影响连接；保留真实会话和既有回答，刷新不恢复已撤销引用。后端撤销成功而草稿气泡清理失败时，界面提供明确的重试入口。

触屏可使用卡片“⋯”和“画布更多操作”，键盘可使用 Shift+F10；菜单靠近视口边缘自动调整，可滚动，Escape 或外部点击关闭。

## 主干与迁移

主干图采用 `managedSchema: 2`，`ownerSessionId` 是接收方的逻辑会话身份。未绑定草稿在首次确定执行会话时绑定；已有同会话主干则复用，并保留未合并草稿。旧混合画布由 Maintenance 转成待归属视图，原对象保留，旧知识线作为 `legacyEdges` 保留检查，不变成授权连接。

普通刷新只读取当前图。更多菜单的“导入当前目标已有引用”按目标分页导入已经存在的 pending/sent 引用，不创建新权限，也不会恢复 `removedRelationIds` 中的引用。读取日志单独分页更新，不抢布局修订。画布目录过滤 `disclosures-*` 日志对象，但保留分页游标。

保存使用修订比较。冲突保留当前编辑，可将本地布局另存未绑定恢复草稿，然后读取服务器主干。恢复草稿不复制活动权限；权威引用仍保留在原主干及 Annotation 数据域。

全局维护网络、全局影响查看、准备重答专属入口及其前端查询已移除。共享对象服务、按域维护、已有贴纸/笔记关联和独立应用保留；本轮不批量删除旧对象。

## 能力与边界

- Maintenance：`maintenanceGraph.protocolVersion === 2`，`ensure/load/save/bind/remove/relations/disclosures`；ThoughtDAG 扩展 schema 2；共享工作区创建服务。
- Annotation：`graph-reference-actions-v1`、`session-main-graph-v2`，统一创建引用、删除引用及 `prepareGraphReferences(targetSessionId, referenceIds)`。
- 真源与源版本由 Maintenance 和 DSH Adapter 解析，画布不复制会话正文，不调用独立模型代理，不写 IndexedDB 会话镜像。
- 源版本不可用时明确失败，不改读最新版本，不自动永久保留版本。
- ThoughtDAG 停用不取消 Annotation 独立跨会话读取，也不删除已有图对象。
- 插件版本及扩展能力必须成组部署；不兼容宿主拒绝写入，不能回落到旧的通用扩展保存旁路。

## 开发验证

```sh
node --experimental-strip-types --test src/maintenance/model.test.mjs src/maintenance/client.test.mjs dsh/tests/managed-host.test.mjs
npm run dsh:build
node dsh/scripts/verify-ui.mjs
```

浏览器验证加载实际打包 SPA 和父窗口 shim，使用合成工作区、会话、引用与位置回执。默认浏览器为 Windows Edge，可用 `TEST_BROWSER` 指定。结果与截图保存在 `.local-e2e/main-graph-browser`；不连接真实用户数据，不发起模型请求。
