# 2026-09-15 ThoughtDAG 会话主干图实施与合成验证

## 交付

DSH 管理界面改为按接收会话唯一归属的主干图，接入 Maintenance `maintenanceGraph.protocolVersion=2`。右键空白添加空卡片/已有会话；空卡片开始时选择工作区，先持久化 `creationWorkspaceId` 再调用共享官方创建服务，重试沿用同一意图，绑定成功清除创建意图字段。真实节点通过 Annotation `prepareGraphReferences` 准备合法入边后进入原会话，保留草稿、附件，不自动发送。

拖线与右键连接共用固定来源确认；空节点只产生待绑定边，确认权限成功后撤销旧待绑定呈现。X → Y 使用 Y 的主干。多条独立引用的来源预览提供固定版本/回复范围选择；分页不改换源版本。材料卡、贴纸与笔记对象能力保留。

右键、工具栏、Delete/Backspace 共用后端 `remove`，原子撤销引用并持久化图，随后清理 Core 草稿气泡；清理失败明确提供重试。主干目录过滤披露日志对象并保留分页游标。全局网络组件、专用查询以及准备重答宿主动作移除，未修改独立应用模型执行器或共享对象服务。

读取位置弹层显示授权截止、来源版本、实际/准备范围、继续位置、截断、未完整问答、交付状态、硬上限和早期裁剪。prepared/failed 不声称已交付。日志分页独立读取，不保存正文或引入模型请求。

## 验证结果

- `node --experimental-strip-types --test src/maintenance/model.test.mjs src/maintenance/client.test.mjs dsh/tests/managed-host.test.mjs`：23 / 23 通过。
- `node dsh/scripts/build.mjs .`：TypeScript 与 DSH 打包构建通过。
- 指定四个 managed TypeScript/TSX 文件的 ESLint：0 错误、0 警告。
- `git diff --check`：通过（仅仓库既有 CRLF 配置提示）。
- `node dsh/scripts/verify-ui.mjs`：7 组真实浏览器流程通过，0 页面错误、0 模型调用、0 真实用户数据访问。

浏览器使用实际打包 SPA 和实际父窗口 shim。断言覆盖：只创建当前主干；删除全局和常驻预览入口；空卡取消不创建；创建工作区分页；确认后单次创建并绑定；添加已有会话不授权；确认 X → Y 只出现于 Y 主干；来源追加仍固定原版本；进入目标只准备合法引用 ID 并保留草稿附件；日志交付未知与裁剪；键盘删除原子撤销且刷新不复活；卡片删除不删除真实会话；冲突保留布局并另存恢复草稿；手机菜单不越界。

合成输出（仓库忽略目录）为 `.local-e2e/main-graph-browser/result.json`、`fixed-source-log.png`、`mobile-menu.png`。已人工查看日志弹层与手机菜单截图。测试曾发现隐藏 iframe 返回时的视口计算和 SVG 边点击后键盘焦点问题，均已修复并纳入最终重跑。

## 范围

本次只修改 ThoughtDAG 源码、使用说明和合成验证，未部署或操作真实会话。Maintenance / Annotation / Sticker 的权威存储、撤销并发与读取执行以对应仓库及整组部署验证为准。旧 `verify-rc2.mjs` 使用 schema 1 合成服务，已不作为此次协议 2 成组验收依据；官方宿主与 strict 安装由整组部署流程验证。历史 `verify-write-bridge.mjs` 亦未运行。
