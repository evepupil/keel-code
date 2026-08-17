# keel-code 仓库开发说明（给 AI 开发会话）

## 先看什么
- 里程碑与状态：`docs/roadmap.md`
- 产品级设计：`docs/设计/`（01 定位、02 对话/子 agent/选模型、03 闭环、04 强制层、05 底座选型）
- 模块归档：`docs/模块设计/`（每个包一份，实现时同步更新）

## 结构
pnpm monorepo，`packages/*` 十个包（engine / methodology / guards / roster / loop / docs / server / web / cli / testkit）。包名 `@keel-code/<name>`，CLI 发布名 `keel-code`。上层只依赖 `@keel-code/engine` 的 `Engine` 接口，不直接 import pi。

## 规矩
- TypeScript strict（根 `tsconfig.base.json`），ESM，Node ≥ 22.12，不用 Bun，v1 不引入原生模块。
- 按职责拆目录 / 文件；判定逻辑写成纯函数并配单测；纯展示层不写单测。
- 提交前 `pnpm gate` 全绿（Biome + tsc + vitest）。
- 改模块必同步 `docs/模块设计/<模块>.md`；里程碑状态 / 依赖 / 退出标准变化才改 roadmap；保持 roadmap ↔ 模块文档双向链接。
- 前端（packages/web）先建设计系统（token + 基础组件）再写页面；禁 emoji 图标、禁渐变、禁空话文案。
- 文档与注释用中文，标识符用英文。
