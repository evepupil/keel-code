# CLI

- **模块定位**：`keel` 命令（发布名 `keel-code`）：`init`（初始化项目：`.keel/`、`docs/` 骨架、`.gitignore`）、`web`（任意目录打开含全部工作区的工作台，后台单实例）、`serve`（前台单项目别名）、`run`（无头跑一个任务，走完整闭环，CI 用）、`status` / `doctor`（环境自检：Node、Git Bash、端点连通）、后期 `tui`。
- **对应代码**：`packages/cli/`（bin：`keel`）
- **所属里程碑**：[M1 — init / serve / doctor](../roadmap.md#m1) → [M5 — run](../roadmap.md#m5) → [M6 — 分发与 tui](../roadmap.md#m6) → [M7 — keel web 多工作区](../roadmap.md#m7) → [M8 — ext](../roadmap.md#m8) → [M9](../roadmap.md#m9) / [M10](../roadmap.md#m10)
- **当前状态**：进行中（init / web / serve / status / doctor / run 已落地）
- **最近更新**：2026-08-19

## 职责与边界

做：命令解析（commander）、装配服务端、打开浏览器、无头运行器、自检、扩展安装。不做：业务逻辑。

## 结构与数据流

```
packages/cli/src/
  bin.ts        入口（#!/usr/bin/env node）
  commands/     init / web / run / status / doctor（serve 是 web --foreground 的别名）
  util/         端口选择、打开浏览器、输出格式
```

## 关键决策

1. `keel web` 单实例：靠 `~/.keel/web.json`（端口 / 令牌 / pid）探活；活着就复用（注册目录 + 开浏览器），不活就后台派生一个 `keel web --foreground` 子进程（日志 `~/.keel/web.log`），等它就绪再开浏览器。`--stop` 结束后台实例。当前目录不是项目（无 .git / .keel）只开工作台不注册。
2. `run` 复用服务层但不起 HTTP，输出纯 stdout（回归 / CI 友好）。
3. `doctor` 明确报告 Windows 前置条件（Git Bash 路径）。

## 当前实现

`packages/cli/src/`：`bin.ts`（入口）、`index.ts`（commander：`-C/--cwd`、`--home`）、`commands/init.ts`（`.keel/config.json`（guards 四开关 + loop + acceptance）、`.keel/agents/README.md`、`docs/roadmap.md` 模板、`docs/模块设计/`、`docs/review/`，只补缺不覆盖）、`commands/doctor.ts`（Node ≥ 22.19 / git / Git Bash / 用户目录可写 / 已配置 provider 与可用模型数）、`util/web-dist.ts`（发布形态 `<cli>/web`，monorepo 形态 `packages/web/dist`）、`util/open-browser.ts`。

`commands/web.ts`：`keel web [dir] [-p 3131] [--no-open] [--foreground] [--stop]`——`findLiveWeb(home)`（web.json 存在 + pid 活着 + `/api/health` 通）；活着 → `POST /api/workspaces {path}`（是项目才注册）→ 打开 `?token=…#/w/<wid>`；不活 → `spawnBackground`（`process.execPath <bin> web --foreground --no-open --port …`，detached + unref，stdout/err 追加到 `~/.keel/web.log`，最多等 20 秒探活）→ 再注册 + 开浏览器；`--foreground` → 已有实例活着就只注册 + 提示 `keel web --stop`，否则 `startServer({ cwd?: 项目目录, writeWebState: true })` 前台跑到 SIGINT；`--stop` → 按 web.json 的 pid `process.kill` 并清文件。`serve` = `web --foreground`（默认端口 3131）。

`commands/run.ts`：`keel run "<任务>" [-c 对话] [-n 新对话标题 -r 职责] [-m provider/id] [--json] [--timeout 分钟]`——`createKeelRuntime({ headless: true })`（审批全放），默认发给主对话，文本增量流到 stdout、工具调用摘要到 stderr，空闲后等后台子 agent（如文档修剪）跑完再退出（封顶 3 分钟）；退出码 0 = idle；`--json` 按行输出事件与结果。

## 验证方式

`commands/init.test.ts`（临时目录：创建 / 跳过 / 不覆盖）、`commands/doctor.test.ts`（版本判定）；实机 `keel doctor` 输出各项检查。
- 无头完整流程（2026-08-18，`commands/run.test.ts`）：真实写文件 → `keel_batch_report` → reviewer 通过 → `git commit` → 后台文档修剪任务完成，验证 stdout / stderr、提交标题与结果文件。

## 发布形态

`keel-code` 与 `@keel-code/*`（web、testkit 除外）均为可发布包；`prepack` 跑 `scripts/copy-web.mjs` 把 `packages/web/dist` 复制到 `packages/cli/web/`（发布产物含 Web 工作台）。8 个 `@keel-code/*` 运行包已发布 `0.1.0`；由于 npm 不允许复用已撤回的 `keel-code@0.1.0`，CLI 使用 `0.1.1` 发布，CLI 发布时用 `pnpm --filter keel-code publish --no-git-checks`，`workspace:*` 会被替换为已发布版本号。开发期用 `pnpm keel <命令>`（根脚本）。

## 待扩展项

- `keel tui`（M6）
- 执行器接口（M6 只留接口）
- **`keel ext`**（[M8](../roadmap.md#m8)）：`install / list / remove`，默认装到 `~/.keel/pi`，`--project` 装到当前项目；打开 `allowExtra` 必须在终端再确认一次警告原文。`keel init` 写出 `extensions` / `skills` 默认段；`keel doctor` 报告默认集是否装齐、哪一项加载失败、`allowExtra` 是否打开。
- **日常驾驶**（[M9](../roadmap.md#m9)）：`keel init` 写出 `precheck` / `permissions.ask|deny`；`keel doctor` 提一句读到了哪些说明书（没有不当错误）。
- **并行与安全网**（[M10](../roadmap.md#m10)）：`keel doctor` 报 worktree 能否建、残留副本、钩子清单、通知是否可发；`keel init` 把 `.keel/worktrees/` 写进 gitignore。

## 改动历史

| 日期 | 改动 |
|---|---|
| 2026-08-17 | M0 骨架与设计 |
| 2026-08-17 | M1：init / serve / status / doctor |
| 2026-08-17 | M7（二）：`keel web`（后台单实例多工作区、--foreground / --stop）、serve 变别名 |
| 2026-08-17 | M5：run 无头模式；init 配置含 permissions / docPrune |
| 2026-08-17 | M6 准备：包设为可发布（publishConfig），prepack 复制 Web 产物到 `<cli>/web`，根脚本 `pnpm keel` |
| 2026-08-18 | M6：公开包统一为 `0.1.0`，准备通过 `pnpm -r publish` 发布；CLI 包 README 补齐 |
| 2026-08-19 | M6：8 个运行包已发布 `0.1.0`；CLI 因 npm 版本不可复用改为 `0.1.1`，待单独发布 |
| 2026-08-17 | run 退出前等待后台子 agent；DeepSeek 真机冒烟通过 |
| 2026-08-17 | M8 设计：`keel ext` / init 配置段 / doctor 扩展检查 |
| 2026-08-17 | M9 / M10 设计：init / doctor 覆盖说明书、危险清单、worktree、钩子 |
| 2026-08-18 | M5 收口：补齐 `keel run` 无头写入、review、提交与后台文档任务的完整 E2E |
