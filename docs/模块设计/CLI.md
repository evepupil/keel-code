# CLI

- **模块定位**：`keel` 命令（发布名 `keel-code`）：`init`（初始化项目：`.keel/`、`docs/` 骨架、`.gitignore`）、`serve`（起本地服务并打开工作台）、`run`（无头跑一个任务，走完整闭环，CI 用）、`status` / `doctor`（环境自检：Node、Git Bash、端点连通）、后期 `tui`。
- **对应代码**：`packages/cli/`（bin：`keel`）
- **所属里程碑**：[M1 — init / serve / doctor](../roadmap.md#m1) → [M5 — run](../roadmap.md#m5) → [M6 — 分发与 tui](../roadmap.md#m6)
- **当前状态**：未开始（M0 仅骨架）
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

M0：仅包骨架（`bin` 指向 `dist/bin.js`，M1 落地）。

## 验证方式

命令级测试（临时目录 `init` 后检查生成物）；`doctor` 在缺 Git Bash 时的提示。

## 待扩展项

- `keel tui`（M6）
- 执行器接口（M6 只留接口）

## 改动历史

| 日期 | 改动 |
|---|---|
| 2026-08-17 | M0 骨架与设计 |
