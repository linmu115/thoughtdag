---
id: IMP-portable-build-20260922
kind: implementation
title: 独立构建与 RC2 运行环境
status: current
summary: 固定 SDK 与工具链，消除隐含作者工作树依赖，统一标明 DSH 0.1.5-rc.2。
---

Node 测试 69 项、Vitest 测试 27 项通过；DSH 构建和打包通过。移除未使用的 Maintenance 开发依赖，显式声明 esbuild，使用 npm 11.5.1 和锁文件。Core required peer 对齐 0.3.12-rc2.28。DSH 插件版本 0.4.14-rc2.27。

完整实施、验证及本次过程草稿见 [独立构建记录](../../../changes/2026-09-22-portable-build.md)。真实实例未升级，UI 未验收。
