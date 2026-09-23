---
id: IMP-client-lifetime-20260923
kind: implementation
title: ThoughtDAG 客户端等待与卸载修复
status: current
summary: 自有取消信号覆盖请求和异步动作；工作区等待完成后释放临时依赖注入。
---

实现 [[REQ-client-lifetime-20260923]]：`dsh/lib/client.js` 为每次挂载建立 AbortController，网络请求同时服从挂载生命周期与原 25 秒请求期限。异步读取或引用准备后、进入下一项会话动作前重新检查；卸载后的回传被忽略。

工作区服务已就绪时不创建注入 fiber；未就绪时最多等待 25 秒。完成、超时、取消均清理监听、定时器和临时 fiber，也处理 inject 同步调用回调后才返回 fiber 的时序。

Core 的动态注入挂载/卸载推进本地代次，旧操作跨代次后明确失败；异步目标解析之后才读取当前 Core，避免持有已经退出的提供者。`managed-graph.js` 在宿主挂载结束时清除该上下文的图端口缓存；重新挂载使用新提供者。可选写入许可服务采用已观察标记与代次检查，断开或许可校验期间切换都拒绝当前写请求，重新就绪后可重试；未引入具体 Maintenance 依赖。旧待决项现状见 [[IMP-write-access-20260921]]。

本次未修改宿主路由注册、插件依赖或版本；未提交、打包、安装或操作运行实例。验证见 [[VER-client-lifetime-20260923]]，过程见 [任务草稿](../../history-drafts/2026-09-23-client-lifetime.md)。
