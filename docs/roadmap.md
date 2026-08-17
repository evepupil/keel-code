# keel-code Roadmap

记录项目目标、里程碑、依赖、状态与退出标准。细节进模块设计文档，这里只留一句话进度和文档入口。

## 目标

做一个「类似 Claude Code / Codex 的编程 agent 工具」，但把一整套开发方法论焊进基础设施：设计先行、review 闭环绑定、强制层拦违规、对话可托管也可随时接管。**核心卖点是下限高**：结构干净、前端不丑、可扩展、可上线，且大幅降低人工监督、纠偏、返工成本。

> 产品级设计（定位、对话与 agent 模型、闭环、强制层、底座选型）归档在 [设计/](设计/README.md)；本表只管里程碑进度。
> **2026-08-17 底座已定**：自研工具本体（CLI + 本地服务 + Web 工作台），引擎内核嵌入 pi（`@earendil-works/pi-*`，MIT），全部 keel 逻辑放在自己的层里。原 DeepSeek Harness 插件包路线归档（见 [设计/05](设计/05-底座选型与调研.md)）。

## 里程碑

| 里程碑 | 目标 | 状态 | 依赖 | 模块文档 | 退出标准 |
|---|---|---|---|---|---|
| [M0](#m0) | 项目初始化：monorepo 骨架、门禁、文档体系 | 已完成 | 无 | [测试工具](模块设计/测试工具.md) | `pnpm gate` 全绿；roadmap 与全部模块文档就位；首个 commit（2026-08-17） |
| [M1](#m1) | 引擎与最小工作台：pi 内核封装、本地服务、最小 Web 聊天、CLI、provider 探测与模型列表、会话持久与恢复 | 未开始 | M0 | [引擎](模块设计/引擎.md) · [服务端](模块设计/服务端.md) · [Web界面](模块设计/Web界面.md) · [CLI](模块设计/CLI.md) · [方法论](模块设计/方法论.md) | Windows 上 `keel serve` 完成一个真实小任务（读/写/编辑/bash）；重启后会话可恢复；Anthropic / OpenAI / DeepSeek 至少两家实测通过 |
| [M2](#m2) | 多对话与名册：主对话创建/列出/发消息/交接其他对话，创建时探测端点选模型；名册与新鲜度；子 agent（clean / fork）一次性委派 | 未开始 | M1 | [对话与名册](模块设计/对话与名册.md) · [方法论](模块设计/方法论.md) | 主对话建对话（自选模型）→ 对话干活 → 用户进入续聊 → 摘要回流名册；clean / fork 子 agent 各跑通并可在 UI 查看 |
| [M3](#m3) | 闭环编排 + 强制层：批次上报 → 独立 reviewer → 分类路由 → 修复循环 → review-pass → 提交门禁；待决策；验收卡；guard-frontend；lint-on-write | 未开始 | M2 | [闭环编排器](模块设计/闭环编排器.md) · [强制层](模块设计/强制层.md) | 三条路径复现：修复-通过-提交 ✅ / 跳过 review 的提交被拒 ✅ / 连续 3 轮不过升级待决策 ✅ |
| [M4](#m4) | 设计确认与看板：设计文档批注编辑器 → 回显理解 → 冻结；看板；待决策队列；验收卡动作 | 未开始 | M3 | [Web界面](模块设计/Web界面.md) · [文档管理](模块设计/文档管理.md) | 一个玩具模块从设计批注走到验收全程在 Web 内完成 |
| [M5](#m5) | 加固与扩展：审批三档、MCP 客户端、压缩策略、`keel run` 无头、文档修剪 job、worktree 并行、workflow 编排（脚本化多 agent） | 未开始 | M4 | [引擎](模块设计/引擎.md) · [文档管理](模块设计/文档管理.md) · [CLI](模块设计/CLI.md) | 无头回归稳定；真实项目跑通完整流程 |
| [M6](#m6) | 分发：npm 发布、`keel tui`、执行器接口（Claude Code / Codex 只留接口不实现） | 未开始 | M5 | [CLI](模块设计/CLI.md) | `npm i -g keel-code` → `keel init` → `keel serve` 三步上手 |

## 阶段说明

### M0
pnpm monorepo（TypeScript 7 strict、Biome、vitest），10 个包骨架（engine / methodology / guards / roster / loop / docs / server / web / cli / testkit），门禁脚本 `pnpm gate`。文档：roadmap + 设计 01–05 + 模块设计 10 份。

### M1
`@keel-code/engine` 封装 pi：会话创建/恢复/fork、发消息、事件流、工具注册、`tool_call` 拦截、系统提示组装、模型与凭据、`keel_providers_probe`。`@keel-code/server` 本地 HTTP + WebSocket。`@keel-code/web` 最小聊天（会话列表 + 流式消息 + 工具调用展示）。`keel init / serve / doctor`。方法论 base 提示词接入。

### M2
对话模型落地：主对话工具（探测端点 → 选模型 → 创建对话 → 发消息 → 交接）；名册事件 + `.keel/agents/*.md` 投影 + 新鲜度（base-commit + code-hash + 缓存 TTL）；子 agent 工具 `keel_agent_run`（clean / fork）。Web：对话树、进入任意对话、名册面板。

### M3
闭环编排器（平移原 dsh 时期 loop 逻辑）：`keel_batch_report` 绑定入口、reviewer = clean 子 agent + 强制结构化结论、代码内分类路由、review-pass 树指纹、提交门禁、`docs/review/待决策.md`、验收卡。强制层：guard-frontend、lint-on-write、commit-gate。

### M4
设计确认交互（核心 UX）：Web 内打开设计文档可编辑视图，划选批注；agent 读 diff 逐条回显理解；冻结标记 + 提交。看板（roadmap 投影 + review 记录 + 待决策数 + 名册）。

### M5
审批（ask / 白名单 / 全放）、MCP 客户端、压缩策略调优、`keel run` 无头、文档修剪 job（提交后兜底）、worktree 并行、workflow 编排。

### M6
npm 发布、`keel tui`（复用 pi 终端界面 + keel 扩展）、执行器接口预留。
