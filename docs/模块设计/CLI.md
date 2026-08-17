# CLI

- **模块定位**：`keel` 命令（发布名 `keel-code`）：`init`（初始化项目：`.keel/`、`docs/` 骨架、`.gitignore`）、`serve`（起本地服务并打开工作台）、`run`（无头跑一个任务，走完整闭环，CI 用）、`status` / `doctor`（环境自检：Node、Git Bash、端点连通）、后期 `tui`。
- **对应代码**：`packages/cli/`（bin：`keel`）
- **所属里程碑**：[M1 — init / serve / doctor](../roadmap.md#m1) → [M5 — run](../roadmap.md#m5) → [M6 — 分发与 tui](../roadmap.md#m6)
- **当前状态**：进行中（M1 init / serve / status / doctor 已落地）
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

## 验证方式

`commands/init.test.ts`（临时目录：创建 / 跳过 / 不覆盖）、`commands/doctor.test.ts`（版本判定）；实机 `keel doctor` 输出各项检查。

## 待扩展项

- `keel tui`（M6）
- 执行器接口（M6 只留接口）

## 改动历史

| 日期 | 改动 |
|---|---|
| 2026-08-17 | M0 骨架与设计 |
| 2026-08-17 | M1：init / serve / status / doctor |
