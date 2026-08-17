# keel-code

一个类似 Claude Code / Codex 的编程 agent 工具，但把开发方法论焊进基础设施：设计先行 → review 闭环 → 提交门禁；主对话托管调度，任意对话随时接管。

> keel = 龙骨：藏在船底看不见，但整条船的稳定与航向由它定住。

## 形态

- `keel serve`：本地服务 + Web 工作台（对话树、富节点聊天、设计文档批注、看板、名册）
- `keel run "<任务>"`：无头跑完整闭环（CI / 回归）
- `keel tui`（后期）：终端界面

引擎内核嵌入 [pi](https://pi.dev)（MIT），全部 keel 逻辑在自己的层里；多 provider（Anthropic / OpenAI / DeepSeek / OpenAI 兼容端点），AI 创建对话时自己探测端点、挑模型。

## 仓库结构

```
packages/
  engine/       pi 内核封装（Engine 接口）
  methodology/  方法论提示词
  guards/       强制层（guard-frontend / lint-on-write / commit-gate / 审批）
  roster/       对话、子 agent、名册、选模型
  loop/         闭环编排器
  docs/         设计文档确认、文档修剪、roadmap 解析
  server/       本地 HTTP + WebSocket
  web/          Web 工作台（React + Vite）
  cli/          keel 命令（发布名 keel-code）
  testkit/      Mock provider 与测试夹具
docs/
  roadmap.md    里程碑
  设计/         产品级设计（01–05）
  模块设计/     各模块归档文档
```

## 开发

```bash
pnpm install
pnpm gate      # lint + typecheck + test（提交前必须全绿）
```

要求 Node ≥ 22.12、pnpm 10；Windows 需要 Git for Windows（bash 工具依赖）。

进度与设计见 [docs/roadmap.md](docs/roadmap.md)。

## License

MIT
