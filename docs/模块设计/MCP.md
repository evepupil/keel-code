# MCP

- **模块定位**：MCP 客户端。读取 `~/.keel/mcp.json` 与项目 `.keel/mcp.json`（`mcpServers` 格式，与 Claude Code 相同，用户可直接照抄），连接 stdio / streamable HTTP 服务器，把每个 MCP 工具注册成引擎工具 `mcp__<server>__<tool>`。
- **对应代码**：`packages/mcp/`（`config.ts`、`client.ts`）；服务端 `runtime.ts` 启动时连接，`GET /api/mcp` 查状态；Web 设置页「MCP 服务器」区块
- **所属里程碑**：[M5 — 加固与扩展](../roadmap.md#m5)
- **当前状态**：进行中（stdio / HTTP 连接、工具注册、状态查询已落地；资源 / 提示词、OAuth、热重载待做）
- **最近更新**：2026-08-17

## 职责与边界

做：配置合并（项目覆盖同名）、连接与工具发现、工具调用结果转文本、状态与释放。连接失败只记日志、不阻塞启动。
不做：MCP 资源 / 提示词（后续）、OAuth 登录、服务器进程守护。

## 结构与数据流

```
~/.keel/mcp.json + <cwd>/.keel/mcp.json ── loadMcpConfig ──▶ McpConfig
                                                              │ connectMcpServers({ engine, config })
                                                              ▼
                     每个服务器：Client.connect(Stdio | StreamableHTTP) → listTools()
                                                              │ 每个工具 → engine.tools.register(mcp__<server>__<tool>, scope main+conversation)
                                                              ▼
                     模型调用 → client.callTool → 内容转文本 → 工具结果
```

## 关键决策

1. **沿用 `mcpServers` 配置形态**：降低迁移成本，用户把 Claude Code 的配置复制过来就能用。
2. **工具名归一为 `mcp__<server>__<tool>`**（只留字母数字下划线）：provider 对工具名有限制。
3. **inputSchema 直接当参数 schema 用**（补 `type: object` 与 `properties`）：MCP 的 JSON Schema 与 pi 的校验兼容。
4. **失败不阻塞**：某个服务器连不上，其他照常；状态可在设置页查看。

## 当前实现

`config.ts`：`loadMcpConfig(keelHome, cwd)`、`isHttpServer`；`client.ts`：`connectMcpServers()`（并行连接、注册、状态、`dispose`）、`toolName`、`normalizeSchema`；测试夹具 `src/__fixtures__/echo-server.mjs`（最小 stdio 服务器）。

## 验证方式

`config.test.ts`（合并 / 覆盖 / 损坏文件忽略、工具名与 schema 归一）；`client.test.ts`（真 stdio 子进程 echo 服务器 + 一个必失败的服务器：状态正确、工具注册进引擎、mock 模型调用 `mcp__echo__echo` 拿到结果、工具定义进入模型请求）。

## 待扩展项

- MCP 资源与提示词
- OAuth / 远程鉴权
- 配置热重载与设置页内编辑
- 按会话 kind 细分可见性

## 改动历史

| 日期 | 改动 |
|---|---|
| 2026-08-17 | M5：stdio / HTTP 客户端、工具注册、状态查询、设置页展示 |
