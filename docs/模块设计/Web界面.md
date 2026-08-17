# Web 界面

- **模块定位**：keel 的工作台，产品体验的主入口。对话树与进入任意对话、富节点聊天（工具调用、review 卡、验收卡、待决策）、设计文档批注编辑器、看板、名册、设置。
- **对应代码**：`packages/web/`（React 19 + Vite + Tailwind v4 + shadcn/ui + CodeMirror 6）
- **所属里程碑**：[M1 — 最小聊天](../roadmap.md#m1) → [M2 — 对话树与名册](../roadmap.md#m2) → [M4 — 设计确认与看板](../roadmap.md#m4)
- **当前状态**：进行中（M1 最小工作台已落地并目验；对话树 / 名册在 M2，批注 / 看板在 M4）
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
    settings/       端点与密钥、模型档位锁定、验收节奏、逃生舱开关
  design-system/  token（色板 / 字体配对 / 间距 / 圆角 / 阴影）+ 基础组件——先于任何业务页面
```

## 关键决策

1. **先建设计系统再写页面**（吃自己的狗粮）：token 单一数据源，组件用 shadcn/ui 变体，禁 emoji 图标、禁渐变、禁空话文案。
2. **批注以文件为准**：批注块直接写进 markdown（`> [!批注] …` 引用块），agent 读 git diff；不建批注数据库。
3. **富节点 = 会话自定义条目的渲染**：review / 验收 / 待决策卡片都是引擎会话里的 keel 条目，刷新页面可回放。
4. **纯展示层不写单测**（全局规范），交互逻辑（如批注块生成、diff 摘要）抽成纯函数写单测。

## 当前实现

`packages/web/src/`：
- `design-system/tokens.css`：Tailwind v4 `@theme` token（色板 oklch、字体配对 sans + mono、圆角 sm/md/lg、阴影），亮暗两套（系统偏好 + `data-theme`），markdown 正文样式 `.prose-keel`。
- `design-system/components/`：`Button`（cva 变体）、`Input / Textarea / Select / Badge / Card / Spinner / Field / EmptyState`、`Dialog`（原生 `<dialog>`）。
- `api/client.ts`：令牌引导（`?token=` → sessionStorage → 抹地址栏）、REST 封装；`api/ws.ts`：自动重连 + 断线重放订阅。
- `store/apply-event.ts`：事件 → 本地消息状态的纯函数（流式 start / update / end、工具执行中、idle 校准标记）；`store/app-store.ts`：`useSyncExternalStore` 小仓库（会话列表 / 当前会话 / 视图 / 模型 / 通知）。
- `features/sessions/Sidebar.tsx`：项目名 + 连接状态、新建对话、分组列表（主对话 / 对话 / 子 agent 挂父 / 已归档）；`NewSessionDialog.tsx`：标题 / 职责 / 模型（按 provider 分组，含单价）/ 首条消息。
- `features/chat/ChatView.tsx`：头部（标题 + 职责 + 模型切换）、消息流（自动贴底）、工具执行中提示、`Composer`（Enter 发送 / Shift+Enter 换行 / 运行中排队 / 中止）；`MessageItem.tsx`：用户气泡、assistant markdown（react-markdown + gfm）、思考折叠、`ToolCallCard`（参数 / 结果 / 失败态）。
- `features/settings/SettingsView.tsx`：provider 列表（常用优先，可展开全部）、粘贴 key 保存 / 移除、探测（可达 / 时延 / 端点模型表）。
- 开发：`vite.config.ts` 把 `/api` `/ws` 代理到 `KEEL_API`（默认 127.0.0.1:3131）；根 `scripts/serve-mock.ts` 起 mock 模型 + keel 服务用于目验。

## 验证方式

- 纯函数单测：`store/apply-event.test.ts`（流式替换 / 定稿 / 工具结果去重 / 执行中状态）。
- 目验（2026-08-17，Playwright + mock 模型）：首页自动建主对话；发消息 → 流式 markdown 回复；`write hello.txt` 工具卡片（参数 / 结果 / 完成态）+ 后续文本；设置页探测显示「可达 2ms」与端点模型数。

## 待扩展项

- 桌面壳（Tauri / Electron，不在 v1）
- Trajectory 回放视图
- 多项目切换（M5）

## 改动历史

| 日期 | 改动 |
|---|---|
| 2026-08-17 | M0 骨架与设计 |
| 2026-08-17 | M1：设计 token + 基础组件、最小聊天、设置页，目验通过 |
