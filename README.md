# ThoughtDAG for DSH

> 当前运行环境：**DSH 0.1.5-rc.2 实例 / web profile**（0.1.5rc2）。其他 DSH 版本尚未验收。


**0.4.14-rc2.27 · DSH 0.1.5-rc.2 · Node.js 24**

为每个 DSH 会话提供可编辑思维图：放入真实会话卡片、组织上下游关系、创建会话贴纸，并回到原生会话继续对话。

## 依赖与数据

运行依赖 Annotation Core 和 DSH 宿主服务。**不依赖 Session Maintenance、Launcher、Obsidian Bridge、普通贴纸或 Sidechat。** 图数据通过 Core 的会话数据端口保存在当前 DSH 实例中，DAG 负责图校验、布局与交互。

当前代码已移除对 Maintenance 的业务调用。源码中保留的 `managed` 路径或文件名是历史命名，不代表需要安装维护引擎；未来外部维护接入应由独立 adapter 实现。

## 安装

先安装 Annotation Core，再从 [dsh-v0.4.14-rc2.27 Release](https://github.com/linmu115/thoughtdag/releases/tag/dsh-v0.4.14-rc2.27) 下载 `dsh-thoughtdag-0.4.14-rc2.27.tgz`。不要用 npm 旧包或 standalone 桌面包代替。

```powershell
$env:DSH_HOME = '<你的 DSH_HOME>'
dsh plugin --profile web add ./dsh-thoughtdag-0.4.14-rc2.27.tgz
```

安装到原来的 Home/profile，再按原来的方式正常启动 DSH。无需手工重复注册 bundle。[完整安装说明](dsh/docs/INSTALL.md)。

## 使用

- 打开真实会话，选择“思维图”，默认显示所属会话卡片。
- 添加已有会话或空卡片，调整布局；名称跟随原生会话当前标题。
- 上下文引用边限定读取来源和范围，由 Core 保存引用与发送状态。
- 拓扑绑定边只记录关系，不自动授权模型读取上游会话。
- 在已完成的 AI 回复中选文并创建“会话贴纸”，会在同一工作区创建新会话，把选文引用放进输入区等待用户发送，并在新会话图中保存来源到目标的单向绑定。此功能不依赖普通贴纸插件。

## 当前边界与开发

仅有上游拓扑绑定时，模型获知关系不等于能够读取来源正文；独立绑定读取工具尚未实现。真实 UI、全部上下文操作和各插件组合应按发布记录分别验收。

[DSH 详细说明与已知限制](dsh/README.md) · [当前项目地图](docs/project/map.md)。源码构建使用锁定工具链与仓库内 SDK，见 [独立构建说明](docs/BUILD.md)；无需作者本机工作树。

仓库也保留 standalone 原型。其历史介绍与构建方式见 [原根 README 快照](docs/history/20260922-README.md)，这部分不作为当前 DSH 部署流程。之前依赖 Maintenance 的说明也仅作为历史保留。

源码开发：[独立克隆、锁定依赖与打包](docs/BUILD.md)。
