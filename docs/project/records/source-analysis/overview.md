---
{
  "id": "SRC-source-inventory",
  "kind": "note",
  "title": "源码入口与依赖",
  "status": "current",
  "generated_by": "project-map-source",
  "summary": "绑定 Git 工作区的入口、静态依赖、待补登记与待复核说明；供人和 LLM 按需查阅。"
}
---
# 源码入口与依赖

这里是绑定工作区的静态扫描结果。用于补查入口、依赖和说明缺口；未登记不代表架构错误，静态引用不等于运行时调用。

LLM 阅读入口：`project_map.py source <地图> --kind entrypoint|dependency|call|symbol|gap|review --query <名称或路径>`。结果支持分页，不必加载全量源码。

## 工作区 source

分支 `codex/independent-plugins-20260920`，提交 `547f9f76f6f1aba9e74c94cbc6f7e60659edaa0a`；扫描 275 个文件。内容指纹 `a955f8f75787bb93`。

### 入口

- `benchmark/tools/generate_figures.py` 356：python_main_guard → `benchmark/tools/generate_figures.py`
- `cli/package.json` #/bin/thoughtdag：package_entry → `dist/thoughtdag.mjs`
- `cli/package.json` #/scripts/build：npm_script → `cd .. && npm run cli:build`
- `cli/package.json` #/scripts/prepack：npm_script → `npm run build`
- `cli/package.json` #/scripts/test：npm_script → `npm run build && node --test test/*.test.mjs`
- `desktop/package.json` #/main：package_entry → `desktop/main.js`
- `desktop/package.json` #/scripts/start：npm_script → `electron .`
- `desktop/package.json` #/scripts/payload：npm_script → `node scripts/prepare-payload.mjs`
- `desktop/package.json` #/scripts/dist:mac：npm_script → `npm run payload && electron-builder --mac dmg zip --arm64 --x64 --publish never`
- `desktop/package.json` #/scripts/dist:win：npm_script → `npm run payload && electron-builder --win nsis --x64 --publish never`
- `desktop/package.json` #/scripts/dist:linux：npm_script → `npm run payload && electron-builder --linux AppImage --x64 --publish never`
- `dsh/package.json` #/main：package_entry → `dsh/lib/index.js`
- `dsh/package.json` #/exports/.：package_entry → `dsh/lib/index.js`
- `dsh/package.json` #/exports/.~1client：package_entry → `dsh/lib/client.js`
- `dsh/package.json` #/exports/.~1cordis.patch.yml：package_entry → `dsh/cordis.patch.yml`
- `dsh/package.json` #/exports/.~1package.json：package_entry → `dsh/package.json`

### 依赖与待补登记

提取 1399 项导入、22793 条静态调用/继承线索；待核对登记缺口 235 项。
- `benchmark/tools/canvases.mjs:6` → `benchmark/tools/lib.mjs`
- `benchmark/tools/compile.mjs:6` → `benchmark/tools/lib.mjs`
- `benchmark/tools/entry.ts:1` → `src/store/context-builder.ts`
- `benchmark/tools/entry.ts:2` → `src/utils.ts`
- `benchmark/tools/equivalence.mjs:8` → `benchmark/tools/lib.mjs`
- `benchmark/tools/equivalence.mjs:9` → `benchmark/tools/reference-compiler.mjs`
- `benchmark/tools/generate-pilot.mjs:7` → `benchmark/tools/lib.mjs`
- `benchmark/tools/lib.mjs:13` → `benchmark/tools/ctx-builder.bundle.mjs`
- `benchmark/tools/run-capture-patient.mjs:7` → `benchmark/tools/lib.mjs`
- `benchmark/tools/run-capture.mjs:7` → `benchmark/tools/lib.mjs`
- `benchmark/tools/run-glm.mjs:6` → `benchmark/tools/lib.mjs`
- `benchmark/tools/score.mjs:5` → `benchmark/tools/lib.mjs`

### 待复核说明

本次没有发现相对既有基线的变化；尚无人工核对基线的说明不因此视为有效。

### 覆盖范围

排除或不支持的文件 2493 项，解析限制 64 项。仅扫描当前 Git 工作区，包含未忽略的新文件；不进入子仓库、依赖包或默认排除目录。动态调用、反射、路径别名及未支持语言需另行核对。完整清单通过 `--kind coverage` 查询。
