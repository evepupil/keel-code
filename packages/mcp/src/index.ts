/**
 * @keel-code/mcp
 *
 * MCP 客户端：读取 mcp.json（mcpServers 格式，全局 + 项目合并），连接 stdio / streamable HTTP 服务器，
 * 把每个 MCP 工具注册成引擎工具 mcp__<server>__<tool>。
 */
export const PACKAGE_NAME = "@keel-code/mcp" as const;
export {
  type ConnectMcpOptions,
  connectMcpServers,
  type McpManager,
  type McpServerStatus,
  normalizeSchema,
  toolName,
} from "./client.js";
export {
  isHttpServer,
  loadMcpConfig,
  type McpConfig,
  type McpHttpServer,
  type McpServerConfig,
  type McpStdioServer,
} from "./config.js";
