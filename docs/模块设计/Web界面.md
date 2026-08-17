# Web 界面

- **模块定位**：keel 的工作台，产品体验的主入口。对话树与进入任意对话、富节点聊天（工具调用、review 卡、验收卡、待决策）、设计文档批注编辑器、看板、名册、设置。
- **对应代码**：`packages/web/`（React 19 + Vite + Tailwind v4 + shadcn/ui + CodeMirror 6）
- **所属里程碑**：[M1 — 最小聊天](../roadmap.md#m1) → [M2 — 对话树与名册](../roadmap.md#m2) → [M4 — 设计确认与看板](../roadmap.md#m4)
- **当前状态**：进行中（M1–M5 各功能面已齐，M7 前端整体重构完成并目验通过；多工作区真机目验待做）
- **最近更新**：2026-08-17

## 职责与边界

做：全部用户可见交互。不做：任何业务判断（分类、门禁、路由都在服务端背后的包里，界面只渲染与回传动作）。

## 结构与数据流

```
packages/web/src/
  app/            路由与布局（左：对话树 / 中：当前对话 / 右：上下文面板）
  api/            HTTP 客户端 + WebSocket 订阅（类型与服务端共享）
  features/
    conversations/  对话树、创建对话向导（含模型选择）、进入 / 切换
    chat/           消息流、工具调用折叠、流式渲染、输入框（模型切换、@ 子 agent）
    review/         review 卡、修复轮次、待决策队列
    acceptance/     验收卡（通过 / 打回 → 回写）
    design-doc/     设计文档批注编辑器（CodeMirror 6 markdown、划选批注、diff 预览、冻结）
    board/          看板（roadmap 表格投影 + review credit + 待决策数 + 名册）
    roster/         名册面板（新鲜度、模型、费用）
    settings/       端点与密钥、模型档次（轻量 / 标准 / 旗舰）与锁定（全局）；项目配置、MCP、扩展与 skills（当前工作区）
    workspaces/     工作区切换器（侧栏顶部）、添加工作区对话框（粘路径 / 原生选目录）、无工作区空态
    models/         具体模型下拉与档次常量（跨 feature 共用）
  design-system/  token（色板 / 字体配对 / 间距 / 圆角 / 阴影）+ 基础组件——先于任何业务页面
```

## 关键决策

1. **先建设计系统再写页面**（吃自己的狗粮）：token 单一数据源，组件用 shadcn/ui 变体，禁 emoji 图标、禁渐变、禁空话文案。
2. **批注以文件为准**：批注块直接写进 markdown（`> [!批注] …` 引用块），agent 读 git diff；不建批注数据库。
3. **富节点 = 会话自定义条目的渲染**：review / 验收 / 待决策卡片都是引擎会话里的 keel 条目，刷新页面可回放。
4. **纯展示层不写单测**（全局规范），交互逻辑（如批注块生成、diff 摘要）抽成纯函数写单测。

## 当前实现

`packages/web/src/`：
- `design-system/tokens.css`：Tailwind v4 `@theme` token（色板 oklch、字体 sans + mono、圆角 sm/md/lg/xl、阴影 sm/md/lg），亮暗两套（系统偏好 + `data-theme`，`lib/theme.ts` 读写 localStorage 并写到 `<html>`），markdown 正文样式 `.prose-keel`。层次：`canvas`（正文，白）/ `side`（侧栏、抽屉、弹窗侧栏，略灰）/ `panel`（卡片、弹层）/ `panel-2`（悬停、徽标、代码底）；`violet` 只给图表分段。
- `design-system/components/`：`Button`（cva 变体）、`IconButton`（xs / sm / md，active 按下态）、`Chip`（outline 输入框内选择器 / soft 上拉按钮）、`Input / Textarea / Select / Badge / Card / Spinner / Field / EmptyState`、`StatusDot`（运行呼吸 / 完成 / 待处理 / 失败）、`Ring`（进度环）、`Segmented`（分段单选）、以及 Radix 封装：`Dialog`（sm / lg，自定义头部）、`Menu`（DropdownMenu，含单选项）、`Popover`、`HoverCard`、`Tabs`（横 / 竖）、`Switch`、`Tip`（Tooltip）。全部传送门渲染，不受滚动容器裁切。开发构建有预览页 `#/dev/design`（`features/dev/DesignPreview.tsx`）把 token 与全部组件摆在一页。
- `api/client.ts`：令牌引导（`?token=` → sessionStorage → 抹地址栏）、REST 封装；`api/ws.ts`：自动重连 + 断线重放订阅。
- `store/apply-event.ts`：事件 → 本地消息状态的纯函数（流式 start / update / end、工具执行中、idle 校准标记）；`store/app-store.ts`：`useSyncExternalStore` 小仓库（工作区列表 / 当前工作区 / 按工作区分桶的会话 / 当前会话 / 视图 / 模型 / 审批 / 通知）。`init` 去重，避免 React 严格模式跑两遍把会话列表冲掉。多工作区：`selectWorkspace(id, target?)` 清空会话态、`setApiWorkspace(id)` 让之后的工作区级请求打到 `/api/w/<wid>/…`、退掉旧 WS 订阅、拉项目 / 会话 / 审批；展开其他项目时 `loadWorkspaceSessions` 懒加载。`app/router.ts`：hash 路由纯函数。`api/ws.ts`：一条连接，订阅带 workspaceId。
- `features/sidebar/`：按项目分组的侧栏。`Sidebar.tsx` 列出全部工作区；`ProjectGroup.tsx` 项目行常驻 `⋯` + 新建，悬停信息卡（名称 / 对话数 / 路径 / 编辑项目）；`SessionRow.tsx` 主对话置顶（锚图标），普通对话悬停出置顶 / 归档，信息卡是职责 + token 三项（缓存命中 / 未命中 / 输出）。子 agent 不进侧栏。`group-sessions.ts` 纯函数分桶。`AddWorkspaceDialog.tsx` 仍在 `features/workspaces/`。
- `features/sessions/NewSessionDialog.tsx`：标题 / 职责 / 模型——先选能力档，需要钉死再「指定具体模型…」；可指定 `workspaceId` 在别的项目里建。`features/models/ModelSelect.tsx`：按 provider 分组的具体模型下拉；`features/models/tiers.ts`：档次常量。
- `features/chat/ChatView.tsx`：头部只留标题 + 一行职责、右上上下文抽屉开关；空对话居中字标 + 输入卡；有消息后时间线贴底、输入卡贴底。子 agent 只读，头部面包屑 +「返回对话」，无输入框。`MessageItem.tsx`：用户气泡灰底圆角（右下小角）、assistant markdown + 悬停信息行（复制 / 时刻·用时·速度·输出量）、思考行与工具行都是 30px 边框行（点开看详情），流式光标。`features/composer/`：`Composer`（卡片、权限 chip、模型 + 思考档菜单、上下文环、发送 / 停止）、`PullBar`（看板 / 子 agent / 任务，互斥上拉）、`stats.ts`（轮 / 步 / token / 缓存命中）。`features/context/ContextDrawer.tsx`：可关的右侧抽屉，名册记录 + token，无费用。
- `features/settings/SettingsDialog.tsx`：全局设置弹窗（`Dialog size=lg`，左侧竖 tab：模型 / 能力档 / 项目 / MCP / 通用；`appStore.openSettings(tab)` 从任何地方打开，`#/settings` 深链也打开它）。`tabs/ModelsTab.tsx`：只列用户加过的提供方（行：名称 / 内置|自定义 / 状态点 / 编辑 / 删除）；底部「添加提供方」「添加自定义提供方」点开后换成灰底卡片（内置下拉选 pi 目录 + 密钥 + 可展开自定义设置；自定义按参考图填 ID / 名称 / 地址 / 协议 / 密钥；编辑预填同一张卡，ID 锁住）；模型目录：「获取模型列表」「添加模型」、空目录提示「选择器不显示，目录外仍可发」。`tabs/ProjectTab.tsx` 包 `ProjectConfig`；`tabs/McpTab.tsx`；`tabs/GeneralTab.tsx`：主题（跟随系统 / 亮 / 暗）。`ModelTiers.tsx`：「模型档次」——三档落点卡（模型 / 单价 / 上下文 / 缺档回退）、每个已配置 provider 一张表（每模型：分段按钮 轻量|标准|旗舰、★ 首选、启用）、各类对话默认档下拉、「锁定具体模型…」收起（main / conversation / subagent / reviewer）；每次改动 PATCH `/settings` 后刷新 `/models/tiers`。
- `features/docs/DocEditor.tsx`：CodeMirror 6 markdown 编辑器（行号 / 历史 / 自动换行 / token 主题），头部：冻结与批注数徽标、批注（在光标行后插块）、保存、「让 AI 读改动」（发提示回来源对话并切回聊天）。
- `features/board/BoardView.tsx`：roadmap 表（状态徽标、模块文档链接直接打开编辑器）、review 记录、待决策（已解决按钮）、名册表。
- `features/chat/ProcessCards.tsx`：`DesignConfirmCard`（打开批注）、`DesignFreezeCard`、`AcceptanceCard`（review 通过后：通过 → 发「验收通过」；打回 → 预填输入框）。
- `features/chat/ApprovalCard.tsx`：审批卡（允许 / 本对话总是允许 / 拒绝），显示在当前对话（含其子 agent）的消息流末尾；`features/settings/ProjectConfig.tsx`：项目配置（审批档位、验收节奏、闭环 / 门禁 / 守卫 / 格式化 / 文档修剪开关），直接写回 `.keel/config.json`。
- `features/chat/ReviewCard.tsx`：review 卡片（通过 / 未通过待修复 / 待决策挂起 / 升级 / 异常），findings 分类徽标，树指纹，「查看 reviewer 轨迹」跳到子会话；`ChatView.buildTimeline` 把消息与 `keel/review` 条目按时间合并。
- `features/roster/RosterPanel.tsx`：右侧名册面板（新鲜度徽标 + 原因、状态、费用、消息数、记录字段），对话空闲时刷新；ChatView 头部对非主对话提供「回主对话」。
- 开发：`vite.config.ts` 把 `/api` `/ws` 代理到 `KEEL_API`（默认 127.0.0.1:3131）；根 `scripts/serve-mock.ts` 起 mock 模型 + keel 服务用于目验。

## 验证方式

- 纯函数单测：`store/apply-event.test.ts`（流式替换 / 定稿 / 工具结果去重 / 执行中状态）。
- 目验（2026-08-17，Playwright + Edge + mock 模型，20 项全过）：外壳与项目分组侧栏、会话悬停信息卡、空状态输入卡、发消息流式回复、用户气泡不重复、消息悬停统计、工具行展开、上拉三面板互斥切换、上下文抽屉开关、设置弹窗深链与各 tab、完整看板、设计确认卡 → 批注编辑器（插入批注落盘）→ AI 读改动回显 → 上报 → review 卡 + 验收卡；主对话模型按档回退落到 mock-1（认证失败的端点被跳过，不选）。

## 待扩展项

- 桌面壳（Tauri / Electron，不在 v1）
- Trajectory 回放视图
- `keel/turn` 条目（消息悬停轮 / 步明细）
- **扩展设置区块**（[M8](../roadmap.md#m8)）：默认集四项（开 / 关、版本、健康）；extra 列表；打开 `allowExtra` 的警告对话框（文案见 [设计/07](../设计/07-能力插槽与扩展.md)，不得改软）+ 理由输入；skills 列表。第一版安装入口可以是复制 `keel ext install`。有 `rewind` 时对话头部出「退回上一刀」。

## 改动历史

| 日期 | 改动 |
|---|---|
| 2026-08-17 | M0 骨架与设计 |
| 2026-08-17 | M1：设计 token + 基础组件、最小聊天、设置页，目验通过 |
| 2026-08-17 | M2：名册面板、模型锁定、回主对话 |
| 2026-08-17 | M7（一）：设置页模型档次、新建对话按档选模型 |
| 2026-08-17 | M7（二）：多工作区——切换器 / 添加 / 移除、hash 路由、API 与 WS 按工作区分桶 |
| 2026-08-17 | M3：review 卡片与时间线合并 |
| 2026-08-17 | M4：文档编辑器、看板、设计确认 / 冻结 / 验收卡、侧栏看板入口 |
| 2026-08-17 | M5：审批卡、项目配置区 |
| 2026-08-17 | M8 设计：设置页扩展 / skills、rewind 入口 |
| 2026-08-17 | 前端重构（一）：token 分层与 xl 圆角、Radix 基础组件、设置弹窗 + tab、主题开关、可折叠侧栏、设计系统预览页 |
| 2026-08-17 | 前端重构（二）：侧栏按项目分组、项目 / 会话悬浮卡、置顶与归档、会话列表带 token 用量 |
| 2026-08-17 | 对话主界面按原型重写：空状态居中、输入卡、上拉三面板、上下文抽屉 |
| 2026-08-17 | 消息区：修用户气泡重复（乐观插入与引擎回放去重）、工具行 / 思考行 / 悬停统计 |
| 2026-08-17 | 任务清单闭环：`keel_tasks_update` 工具 + `keel/tasks` 条目 + 方法论规则，「任务」上拉真数据 |
| 2026-08-17 | 设置 › 模型：默认不列内置提供方；底部添加 / 添加自定义切灰底卡片（下拉 / 手填 / 编辑共用），模型目录可拉远端或手加 |
