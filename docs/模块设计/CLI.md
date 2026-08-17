# CLI

- **模块定位**：`keel` 命令（发布名 `keel-code`）：`init`（初始化项目：`.keel/`、`docs/` 骨架、`.gitignore`）、`serve`（起本地服务并打开工作台）、`run`（无头跑一个任务，走完整闭环，CI 用）、`status` / `doctor`（环境自检：Node、Git Bash、端点连通）、后期 `tui`。
- **对应代码**：`packages/cli/`（bin：`keel`）
- **所属里程碑**：[M1 — init / serve / doctor](../roadmap.md#m1) → [M5 — run](../roadmap.md#m5) → [M6 — 分发与 tui](../roadmap.md#m6)
- **当前状态**：进行中（init / serve / status / doctor / run 已落地）
- **最近更新**：2026-08-17

## 职责与边界

做：命令解析（commander）、装配服务端、打开浏览器、无头运行器、自检。不做：业务逻辑。

## 结构与数据流

```
packages/cli/src/
  bin.ts        入口（#!/usr/bin/env node）
  commands/     init / serve / run / status / doctor
  util/         端口选择、打开浏览器、输出格式
```

## 关键决策

1. `serve --port 0` 自动挑空闲端口，支持多 worktree 并行各起一份。
2. `run` 复用服务层但不起 HTTP，输出纯 stdout（回归 / CI 友好）。
3. `doctor` 明确报告 Windows 前置条件（Git Bash 路径）。

## 当前实现

`packages/cli/src/`：`bin.ts`（入口）、`index.ts`（commander：`-C/--cwd`、`--home`）、`commands/init.ts`（`.keel/config.json`（guards 四开关 + loop + acceptance）、`.keel/agents/README.md`、`docs/roadmap.md` 模板、`docs/模块设计/`、`docs/review/`，只补缺不覆盖）、`commands/doctor.ts`（Node ≥ 22.19 / git / Git Bash / 用户目录可写 / 已配置 provider 与可用模型数）、`util/web-dist.ts`（发布形态 `<cli>/web`，monorepo 形态 `packages/web/dist`）、`util/open-browser.ts`。`serve` 默认端口 3131，`--port 0` 自动挑选，`--no-open` 不开浏览器。

`commands/run.ts`：`keel run "<任务>" [-c 对话] [-n 新对话标题 -r 职责] [-m provider/id] [--json] [--timeout 分钟]`——`createKeelRuntime({ headless: true })`（审批全放），默认发给主对话，文本增量流到 stdout、工具调用摘要到 stderr，空闲后等后台子 agent（如文档修剪）跑完再退出（封顶 3 分钟）；退出码 0 = idle；`--json` 按行输出事件与结果。

## 验证方式

`commands/init.test.ts`（临时目录：创建 / 跳过 / 不覆盖）、`commands/doctor.test.ts`（版本判定）；实机 `keel doctor` 输出各项检查。

## 发布形态

`keel-code` 与 `@keel-code/*`（web、testkit 除外）均为可发布包；`prepack` 跑 `scripts/copy-web.mjs` 把 `packages/web/dist` 复制到 `packages/cli/web/`（发布产物含 Web 工作台）；`pnpm -r publish` 发布，`workspace:*` 会被替换为版本号。开发期用 `pnpm keel <命令>`（根脚本）。

## 待扩展项

- `keel tui`（M6）
- 执行器接口（M6 只留接口）

## 改动历史

| 日期 | 改动 |
|---|---|
| 2026-08-17 | M0 骨架与设计 |
| 2026-08-17 | M1：init / serve / status / doctor |
| 2026-08-17 | M5：run 无头模式；init 配置含 permissions / docPrune |
| 2026-08-17 | M6 准备：包设为可发布（publishConfig），prepack 复制 Web 产物到 `<cli>/web`，根脚本 `pnpm keel` |
| 2026-08-17 | run 退出前等待后台子 agent；DeepSeek 真机冒烟通过 |
