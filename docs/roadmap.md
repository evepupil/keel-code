# keel-code Roadmap

记录项目目标、里程碑、依赖、状态与退出标准。细节进模块设计文档，这里只留一句话进度和文档入口。

## 目标

做一个「类似 Claude Code / Codex 的编程 agent 工具」，但把一整套开发方法论焊进基础设施：设计先行、review 闭环绑定、强制层拦违规、对话可托管也可随时接管。**核心卖点是下限高**：结构干净、前端不丑、可扩展、可上线，且大幅降低人工监督、纠偏、返工成本。

> 产品级设计（定位、对话与 agent 模型、闭环、强制层、底座选型、能力档与多工作区、能力插槽）归档在 [设计/](设计/README.md)；本表只管里程碑进度。
> **2026-08-17 底座已定**：自研工具本体（CLI + 本地服务 + Web 工作台），引擎内核嵌入 pi（`@earendil-works/pi-*`，MIT），全部 keel 逻辑放在自己的层里。原 DeepSeek Harness 插件包路线归档（见 [设计/05](设计/05-底座选型与调研.md)）。

## 里程碑

| 里程碑 | 目标 | 状态 | 依赖 | 模块文档 | 退出标准 |
|---|---|---|---|---|---|
| [M0](#m0) | 项目初始化：monorepo 骨架、门禁、文档体系 | 已完成 | 无 | [测试工具](模块设计/测试工具.md) | `pnpm gate` 全绿；roadmap 与全部模块文档就位；首个 commit（2026-08-17） |
| [M1](#m1) | 引擎与最小工作台：pi 内核封装、本地服务、最小 Web 聊天、CLI、provider 探测与模型列表、会话持久与恢复 | 已完成 | M0 | [引擎](模块设计/引擎.md) · [服务端](模块设计/服务端.md) · [Web界面](模块设计/Web界面.md) · [CLI](模块设计/CLI.md) · [方法论](模块设计/方法论.md) | Windows 上 `keel serve` 完成一个真实小任务（读/写/编辑/bash）✅（mock 模型 + Playwright 目验，2026-08-17）；重启后会话可恢复 ✅（引擎测试）；真实 provider 实测：DeepSeek ✅（2026-08-17，`keel run` 跑通实现 → reviewer 反相位选 v4-pro → 修复 → 通过 → 门禁放行提交，$0.0034）；Anthropic / OpenAI 待 key |
| [M2](#m2) | 多对话与名册：主对话创建/列出/发消息/交接其他对话，创建时探测端点选模型；名册与新鲜度；子 agent（clean / fork）一次性委派 | 进行中 | M1 | [对话与名册](模块设计/对话与名册.md) · [方法论](模块设计/方法论.md) | 主对话建对话（自选模型）→ 对话干活 → 用户进入续聊 → 摘要回流名册 ✅（mock 端到端）；clean 子 agent 跑通 ✅、fork 已实现（待用例）；UI 查看子 agent（挂在父对话下）✅ |
| [M3](#m3) | 闭环编排 + 强制层：批次上报 → 独立 reviewer → 分类路由 → 修复循环 → review-pass → 提交门禁；待决策；验收卡；guard-frontend；lint-on-write | 进行中 | M2 | [闭环编排器](模块设计/闭环编排器.md) · [强制层](模块设计/强制层.md) | 三条路径：修复-通过-提交 ✅（mock 端到端）/ 跳过 review 的提交被拒 ✅ / 待决策挂起落档 ✅ / 连续 3 轮升级（路由单测 ✅，端到端待补）；review 卡片进聊天时间线 ✅ |
| [M4](#m4) | 设计确认与看板：设计文档批注编辑器 → 回显理解 → 冻结；看板；待决策队列；验收卡动作 | 进行中 | M3 | [Web界面](模块设计/Web界面.md) · [文档管理](模块设计/文档管理.md) | 一个玩具模块从设计批注走到验收全程在 Web 内完成 ✅（mock 目验：确认卡 → 批注 → 回显 → 上报 → review 卡 → 验收卡；冻结工具已实现待目验） |
| [M5](#m5) | 加固与扩展：审批三档、MCP 客户端、压缩策略、`keel run` 无头、文档修剪 job、worktree 并行、workflow 编排（脚本化多 agent） | 进行中 | M4 | [引擎](模块设计/引擎.md) · [文档管理](模块设计/文档管理.md) · [CLI](模块设计/CLI.md) · [MCP](模块设计/MCP.md) | 审批三档 ✅ / `keel run` ✅ / 文档修剪 job ✅ / MCP 客户端 ✅ / workflow 编排 ✅（2026-08-17）；压缩策略沿用 pi 默认自动压缩（真实使用后再调）；worktree 并行待做（当前做法：每个 worktree 各起一份 `keel serve`）；无头回归稳定；真实项目跑通完整流程 |
| [M7](#m7) | 能力档 + 多工作区：AI 只说档次（轻量 / 标准 / 旗舰）由系统落实并只起能通的；`keel web` 单实例多工作区 | 进行中 | M5 | [对话与名册](模块设计/对话与名册.md) · [服务端](模块设计/服务端.md) · [CLI](模块设计/CLI.md) · [Web界面](模块设计/Web界面.md) | 设置页配档 → AI 建对话按档落实、缺档回退有提示、不通的端点不被选；任意目录 `keel web` 打开含全部工作区的工作台 |
| [M6](#m6) | 分发：npm 发布、`keel tui`、执行器接口（Claude Code / Codex 只留接口不实现） | 进行中 | M5 | [CLI](模块设计/CLI.md) | 包已设为可发布、Web 产物随 CLI 打包（2026-08-17，未实际发布）；`npm i -g keel-code` → `keel init` → `keel serve` 三步上手 |
| [M8](#m8) | 能力插槽：默认集（搜索 / 浏览器 / 代码智能 / 回滚）+ 用户可自装 pi 扩展（项目开关 + 留痕 + 警告）+ Skills | 未开始 | M5 | [扩展与技能](模块设计/扩展与技能.md) · [引擎](模块设计/引擎.md) · [MCP](模块设计/MCP.md) · [强制层](模块设计/强制层.md) · [闭环编排器](模块设计/闭环编排器.md) · [CLI](模块设计/CLI.md) · [Web界面](模块设计/Web界面.md) | 开箱有搜索和浏览器；`allowExtra` 默认关，打开必须写理由且弹出警告；skills 可被模型发现；扩展工具仍过三道闸；坏扩展不拖死会话；前端批次在有浏览器能力时必须先看页面再上报 |

## 阶段说明

### M0
pnpm monorepo（TypeScript 7 strict、Biome、vitest），10 个包骨架（engine / methodology / guards / roster / loop / docs / server / web / cli / testkit），门禁脚本 `pnpm gate`。文档：roadmap + 设计 01–05 + 模块设计 10 份（后续增至 01–07、模块设计 11 份）。

### M1
2026-08-17：引擎 / 服务端 / Web 最小工作台 / CLI / 方法论 base 全部落地；真实 DeepSeek 冒烟通过（完整闭环）。M1 关闭。运行要求：Node ≥ 22.19（pi 内核要求）。

`@keel-code/engine` 封装 pi：会话创建/恢复/fork、发消息、事件流、工具注册、`tool_call` 拦截、系统提示组装、模型与凭据、`keel_providers_probe`。`@keel-code/server` 本地 HTTP + WebSocket。`@keel-code/web` 最小聊天（会话列表 + 流式消息 + 工具调用展示）。`keel init / serve / doctor`。方法论 base 提示词接入。

### M2
2026-08-17：roster 包落地（主对话工具、子 agent、名册 + 新鲜度 + 投影、模型锁定），服务端与 Web 接入，50 用例全绿。剩：fork 子 agent 用例、真实模型下的调度体验打磨。

对话模型落地：主对话工具（探测端点 → 选模型 → 创建对话 → 发消息 → 交接）；名册事件 + `.keel/agents/*.md` 投影 + 新鲜度（base-commit + code-hash + 缓存 TTL）；子 agent 工具 `keel_agent_run`（clean / fork）。Web：对话树、进入任意对话、名册面板。

### M3
2026-08-17：loop + guards 包落地并接入服务端与 Web，63 用例全绿。剩：连续 3 轮升级的端到端用例、验收卡动作（归 M4）。

闭环编排器（平移原 dsh 时期 loop 逻辑）：`keel_batch_report` 绑定入口、reviewer = clean 子 agent + 强制结构化结论、代码内分类路由、review-pass 树指纹、提交门禁、`docs/review/待决策.md`、验收卡。强制层：guard-frontend、lint-on-write、commit-gate。

### M4
2026-08-17：docs 包（批注 / 冻结 / 改动读取工具、安全文件 API、roadmap 解析）+ 服务端文档 / 看板路由 + Web 编辑器 / 看板 / 卡片落地，纯文档提交豁免门禁，73 用例全绿。

设计确认交互（核心 UX）：Web 内打开设计文档可编辑视图，划选批注；agent 读 diff 逐条回显理解；冻结标记 + 提交。看板（roadmap 投影 + review 记录 + 待决策数 + 名册）。

### M5
2026-08-17：运行时组合根 + 审批（edits / ask / yolo，WS 卡片）+ `keel run` + 提交后文档修剪 job + 项目配置区落地；MCP 客户端（`@keel-code/mcp`，mcpServers 配置格式）落地。

审批（ask / 白名单 / 全放）、MCP 客户端、压缩策略调优、`keel run` 无头、文档修剪 job（提交后兜底）、worktree 并行、workflow 编排。

### M7
设计见 [设计/06](设计/06-模型档次与多工作区.md)。顺序：先能力档，再多工作区，最后前端整体重构。
2026-08-17：能力档已落地（选择器 + 工具收 tier + reviewer / 文档修剪按档 + 设置页 / 新建对话按档选）；多工作区已落地（EngineHost 共享宿主、工作区注册表 + 懒加载 / 闲置释放、`/api/w/:wid/*` + WS 带 workspaceId、`keel web` 后台单实例、Web 切换器 + hash 路由）。前端整体重构完成并目验通过（Playwright + mock，20 项：外壳 / 侧栏 / 聊天 / 上拉三面板 / 抽屉 / 设置 / 看板 / 设计确认闭环）；目验中发现并修复两处——认证失败（401/403）的端点被选档器选中、上拉面板互斥切换全关。待：`keel web` 多工作区真机目验后关闭。

### M6
2026-08-17：发布形态准备（publishConfig、prepack 复制 Web 产物、`pnpm keel` 根脚本）；实际 `npm publish`、`keel tui`、执行器接口待做。

npm 发布、`keel tui`（复用 pi 终端界面 + keel 扩展）、执行器接口预留。

### M8
设计见 [设计/07](设计/07-能力插槽与扩展.md)。借生态补齐搜索 / 浏览器 / LSP / 回滚，强制层和闭环挂钩仍是自己的。

顺序：先打开加载器（隔离目录、keel 扩展仍第一、skills、配置字段）→ 钉默认集四项 → `keel ext` 与设置页开关 / 警告 → 闭环挂钩（先浏览器）→ 失败隔离与 doctor。

不做：dsh / Cordis 适配、自动继承 `~/.pi/agent`、再装一份 pi 的 MCP 扩展、Claude Code 插件市场（后置）。

未进本里程碑、仍要另开需求的：图片输入、上报前自检、读 `AGENTS.md`、worktree 并行、危险命令清单。
