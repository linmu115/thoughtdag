# DAG 统一会话数据边界修复

本轮纠正：DAG 无条件使用 Core 公共会话数据/引用端口，删除旧 Maintenance 优先选择。主干能力必须通过实际读取检查；图合法性和增删仍由 DAG 负责。10 项针对性测试通过，实际 WebUI 待修复 Maintenance .35 注册识别后验证。

版本：Core 0.3.12-rc2.21、DAG 0.4.14-rc2.17；与 Maintenance .35 的图数据 adapter 合成往返测试通过。当前实际部署被 Maintenance 注册阶段的版本白名单遗漏阻断，尚未验收真实页面和引用调用。
