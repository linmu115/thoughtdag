# 从独立仓库构建

当前运行环境是 **DSH 0.1.5-rc.2 实例 / web profile**。其他 DSH 版本未验收。以下是开发和打包步骤，不会启动实例、修改绑定或向 Vault 写入。

工具链：Node.js **24.7.0**（见 `.node-version`）。安装步骤需要访问 npm registry；仓库内 SDK 已随源码提供，不需要其它作者工作树。使用锁文件安装，日常不要执行升级依赖命令。

```powershell
git clone https://github.com/linmu115/thoughtdag.git
cd thoughtdag
# 使用 npm 11.5.1，与 packageManager 声明一致
npm ci
npm run dsh:build
node --test dsh/tests/*.test.mjs src/maintenance/*.test.mjs
npm run test:ownership
npm run package:release
```

`package-lock.json` 固定依赖。打包结果为 `.artifacts/dsh-thoughtdag-<版本>.tgz`；这是 DSH 插件包，不是 standalone 桌面应用。根目录仅用于编译，安装 DSH 插件不要直接安装根 package.json。

不再引用 Maintenance contracts 开发目录；构建用到的 esbuild 已直接声明。测试中使用的模拟网页不等于真实实例 UI 验收。
