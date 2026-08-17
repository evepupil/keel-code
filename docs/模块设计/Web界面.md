# Web 界面

- **模块定位**：keel 的工作台，产品体验的主入口。对话树与进入任意对话、富节点聊天（工具调用、review 卡、验收卡、待决策）、设计文档批注编辑器、看板、名册、设置。
- **对应代码**：`packages/web/`（React 19 + Vite + Tailwind v4 + shadcn/ui + CodeMirror 6）
- **所属里程碑**：[M1 — 最小聊天](../roadmap.md#m1) → [M2 — 对话树与名册](../roadmap.md#m2) → [M4 — 设计确认与看板](../roadmap.md#m4)
- **当前状态**：进行中（M1 最小工作台 + M2 名册 + M3 review 卡 + M4 文档编辑器 / 看板 / 设计确认卡 / 验收卡已落地）
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
- `store/apply-event.ts`：事件 → 本地消息状态的纯函数（流式 start / update / end、工具执行中、idle 校准标记）；`store/app-store.ts`：`useSyncExternalStore` 小仓库（工作区列表 / 当前工作区 / 会话列表 / 当前会话 / 视图 / 模型 / 审批 / 通知）。多工作区：`selectWorkspace(id, target?)` 清空会话态、`setApiWorkspace(id)` 让 `api/client.ts` 之后的工作区级请求都打到 `/api/w/<wid>/…`、退掉旧 WS 订阅、拉项目 / 会话 / 审批；异步回包用切换序号防串台；其他工作区的审批只计数（切换器角标）。`app/router.ts`：hash 路由纯函数（`#/w/<wid>` / `#/w/<wid>/c/<sid>` / `#/w/<wid>/board` / `#/w/<wid>/doc/<path>` / `#/settings`），进入时解析地址栏、状态变化时 `replaceState` 回写、监听 `hashchange`。`api/ws.ts`：一条连接，`subscribe(workspaceId, sessionId)`，事件 / 名册变化 / 审批带 workspaceId，`workspaces_changed` 刷新列表。
- `features/workspaces/WorkspaceSwitcher.tsx`：侧栏顶部当前工作区（名称 / 路径 / 连接状态 / 其他工作区待审批角标）→ 下拉：全部工作区（✓ 当前、已加载点、待审批数、悬停 ✕ 移除）+ 「添加工作区…」；`AddWorkspaceDialog.tsx`：粘路径或「选择文件夹…」（`POST /workspaces/pick` 弹系统对话框）；`WorkspaceEmpty.tsx`：没有工作区时的主区域。
- `features/sessions/Sidebar.tsx`：工作区切换器、新建对话、分组列表（主对话 / 对话 / 子 agent 挂父 / 已归档）；`NewSessionDialog.tsx`：标题 / 职责 / 模型——先选能力档（三个 chip 显示会落到的模型、单价、回退提示，默认取普通对话默认档），需要钉死再「指定具体模型…」/ 首条消息。`features/models/ModelSelect.tsx`：按 provider 分组的具体模型下拉（provider::id）；`features/models/tiers.ts`：档次常量与单价格式。
- `features/chat/ChatView.tsx`：头部（标题 + 职责 + 模型切换）、消息流（自动贴底）、工具执行中提示、`Composer`（Enter 发送 / Shift+Enter 换行 / 运行中排队 / 中止）；`MessageItem.tsx`：用户气泡、assistant markdown（react-markdown + gfm）、思考折叠、`ToolCallCard`（参数 / 结果 / 失败态）。
- `features/settings/SettingsDialog.tsx`：全局设置弹窗（`Dialog size=lg`，左侧竖 tab：模型 / 能力档 / 项目 / MCP / 通用；`appStore.openSettings(tab)` 从任何地方打开，`#/settings` 深链也打开它）。`tabs/ModelsTab.tsx`：provider 列表（常用优先，可展开全部）、粘贴 key 保存 / 移除、探测（可达 / 时延 / 端点模型表：上下文 / 推理 / 端点）；`tabs/ProjectTab.tsx` 包 `ProjectConfig`；`tabs/McpTab.tsx`；`tabs/GeneralTab.tsx`：主题（跟随系统 / 亮 / 暗）。`ModelTiers.tsx`：「模型档次」——三档落点卡（模型 / 单价 / 上下文 / 缺档回退）、每个已配置 provider 一张表（每模型：分段按钮 轻量|标准|旗舰、★ 首选、启用）、各类对话默认档下拉、「锁定具体模型…」收起（main / conversation / subagent / reviewer）；每次改动 PATCH `/settings` 后刷新 `/models/tiers`。
- `features/docs/DocEditor.tsx`：CodeMirror 6 markdown 编辑器（行号 / 历史 / 自动换行 / token 主题），头部：冻结与批注数徽标、批注（在光标行后插块）、保存、「让 AI 读改动」（发提示回来源对话并切回聊天）。
- `features/board/BoardView.tsx`：roadmap 表（状态徽标、模块文档链接直接打开编辑器）、review 记录、待决策（已解决按钮）、名册表。
- `features/chat/ProcessCards.tsx`：`DesignConfirmCard`（打开批注）、`DesignFreezeCard`、`AcceptanceCard`（review 通过后：通过 → 发「验收通过」；打回 → 预填输入框）。
- `features/chat/ApprovalCard.tsx`：审批卡（允许 / 本对话总是允许 / 拒绝），显示在当前对话（含其子 agent）的消息流末尾；`features/settings/ProjectConfig.tsx`：项目配置（审批档位、验收节奏、闭环 / 门禁 / 守卫 / 格式化 / 文档修剪开关），直接写回 `.keel/config.json`。
- `features/chat/ReviewCard.tsx`：review 卡片（通过 / 未通过待修复 / 待决策挂起 / 升级 / 异常），findings 分类徽标，树指纹，「查看 reviewer 轨迹」跳到子会话；`ChatView.buildTimeline` 把消息与 `keel/review` 条目按时间合并。
- `features/roster/RosterPanel.tsx`：右侧名册面板（新鲜度徽标 + 原因、状态、费用、消息数、记录字段），对话空闲时刷新；ChatView 头部对非主对话提供「回主对话」。
- 开发：`vite.config.ts` 把 `/api` `/ws` 代理到 `KEEL_API`（默认 127.0.0.1:3131）；根 `scripts/serve-mock.ts` 起 mock 模型 + keel 服务用于目验。

## 验证方式

- 纯函数单测：`store/apply-event.test.ts`（流式替换 / 定稿 / 工具结果去重 / 执行中状态）。
- 目验（2026-08-17，Playwright + mock 模型）：设计确认卡 → 编辑器批注 → AI 回显；review 失败 / 通过卡 + 验收卡；看板；首页自动建主对话；发消息 → 流式 markdown 回复；`write hello.txt` 工具卡片（参数 / 结果 / 完成态）+ 后续文本；设置页探测显示「可达 2ms」与端点模型数。

## 待扩展项

- 桌面壳（Tauri / Electron，不在 v1）
- Trajectory 回放视图
- 前端重构（二）侧栏多项目分组 /（三）对话区与输入区，按 `docs/设计/原型/web-布局原型.html`
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
