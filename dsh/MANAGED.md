# 会话图的数据与接入边界

本版通过 Core 的 sessionExtensionData / sessionReferenceContext 公共接口工作。DAG 校验图结构、执行增删与交互，持久存储交给会话数据层；本地基础功能不依赖 Maintenance。

会话身份决定唯一图身份。首次创建带所属会话卡片；初始修订 1 空图可原地补齐。已有编辑图和后续主动删除不被强行重建。会话名称来自 rc.2 标题投影，显示名称变化不写图修订；固定材料的标签不跟随重命名。

连线涉及上下文授权，需通过 Core 检查来源与固定范围；不得伪造 relationId 直接取得权限。注册受管实例后通用写入许可仍生效，失联不自动变为独立写入。

Maintenance 同步及 adapter 的后续开发没有纳入本批交付。旧受管说明保留在源码仓库 docs/history，不能作为本版必装依赖教程。

安装、更新、卸载和使用见 [INSTALL](docs/INSTALL.md)，验证与限制见 [RELEASE](docs/RELEASE-20260920.md)。
